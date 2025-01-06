// @ts-ignore
import * as discordMDX from 'discord-markdown'
const { toHTML } = discordMDX
import { qs } from '@root/utilities/qs'
import cliProgress from 'cli-progress'
import { cookies } from 'next/headers'

import sanitizeSlug from '../utilities/sanitizeSlug'

const { DISCORD_GUILD_ID, DISCORD_SCRAPE_CHANNEL_ID, DISCORD_TOKEN, NEXT_PUBLIC_CMS_URL } =
  process.env
const DISCORD_API_BASE = 'https://discord.com/api/v10'
const answeredTag = '1034538089546264577'
const headers = {
  Authorization: `Bot ${DISCORD_TOKEN}`,
}

type Thread = {
  applied_tags: string[]
  guild_id: string
  id: string
  message_count: number
  name: string
  thread_metadata: {
    archive_timestamp: string
    archived: boolean
  }
}

type Message = {
  attachments: any[]
  author: {
    avatar: string
    bot: boolean
    id: string
    username: string
  }
  bot: boolean
  content: string
  position: number
  timestamp: string
}

function segmentArray(array, segmentSize) {
  const result: Array<(typeof array)[0]> = []
  for (let i = 0; i < array.length; i += segmentSize) {
    result.push(array.slice(i, i + segmentSize))
  }
  return result
}

async function fetchFromDiscord(
  endpoint: string,
  fetchType: 'messages' | 'threads',
): Promise<any[]> {
  const baseURL = `${DISCORD_API_BASE}${endpoint}`
  const allResults: Message[] | Thread[] = []
  const params: Record<string, string> = fetchType === 'messages' ? { limit: '100' } : {}

  while (true) {
    const url = new URL(baseURL)
    Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value))

    const response = await fetch(url, { headers })
    if (!response.ok) {
      throw new Error(`Failed to fetch ${endpoint}: ${response.statusText}`)
    }

    const data = await response.json()
    if (fetchType === 'threads') {
      allResults.push(...(data.threads || []))
      if (!data.has_more) {
        break
      }
      params.before = data.threads[data.threads.length - 1].thread_metadata.archive_timestamp
    } else {
      allResults.push(...data)
      if (data.length < 100) {
        break
      }
      params.before = data[data.length - 1]?.id
    }
  }

  return allResults
}

function processMessages(messages: Message[]) {
  const mergedMessages = new Map()

  messages.reverse().forEach((message: Message) => {
    const key = message.author.id
    if (mergedMessages.has(key)) {
      const prevMessage = mergedMessages.get(key)
      prevMessage.content += `\n\n${message.content}`
      prevMessage.attachments = prevMessage.attachments.concat(message.attachments)
    } else {
      mergedMessages.set(key, message)
    }
  })

  return Array.from(mergedMessages.values())
}
function createSanitizedThread(thread: Thread, messages: Message[]) {
  const [intro, ...combinedResponses] = processMessages(messages)

  return {
    slug: sanitizeSlug(thread.name),
    info: {
      id: thread.id,
      name: thread.name,
      archived: thread.thread_metadata.archived,
      createdAt: thread.thread_metadata.archive_timestamp,
      guildId: thread.guild_id,
    },
    intro: intro
      ? {
          authorAvatar: intro.author.avatar,
          authorID: intro.author.id,
          authorName: intro.author.username,
          content: toHTML(intro.content),
        }
      : {},
    messageCount: combinedResponses.length,
    messages: combinedResponses.map(({ attachments, author, content, timestamp }) => ({
      authorAvatar: author.avatar,
      authorID: author.id,
      authorName: author.username,
      content: toHTML(content),
      createdAt: new Date(timestamp),
      fileAttachments: attachments,
    })),
    ogMessageCount: thread.message_count,
  }
}

async function fetchDiscord() {
  if (!DISCORD_TOKEN || !DISCORD_GUILD_ID || !DISCORD_SCRAPE_CHANNEL_ID) {
    const missingEnvVars = ['DISCORD_TOKEN', 'DISCORD_GUILD_ID', 'DISCORD_SCRAPE_CHANNEL_ID']
      .filter((envVar) => !process.env[envVar])
      .join(', ')
    throw new Error(`Missing required Discord variables: ${missingEnvVars}.`)
  }

  const bar = new cliProgress.SingleBar(
    {
      barCompleteChar: '=',
      barIncompleteChar: '-',
      format: 'Populating Threads | {bar} | {percentage}% | {value}/{total}',
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  )

  console.time('Populating Discord')

  const activeThreadsData = await fetchFromDiscord(
    `/guilds/${DISCORD_GUILD_ID}/threads/active`,
    'threads',
  )
  const archivedThreadsData = await fetchFromDiscord(
    `/channels/${DISCORD_SCRAPE_CHANNEL_ID}/threads/archived/public`,
    'threads',
  )

  const allThreads = [...activeThreadsData, ...archivedThreadsData].filter(
    (thread) => thread.applied_tags?.includes(answeredTag) && thread.message_count > 1,
  ) as Thread[]

  const existingThreadIDs = await fetch(
    `${NEXT_PUBLIC_CMS_URL}/api/community-help?depth=0&where[communityHelpType][equals]=discord&limit=0`,
  )
    .then((res) => res.json())
    .then((data) =>
      data.docs.map((thread) => ({
        id: thread.discordID,
        messageCount: thread.ogMessageCount || 0,
      })),
    )

  const filteredThreads = allThreads.filter((thread) => {
    const existingThread = existingThreadIDs.find((existing) => existing.id === thread.id)
    return !existingThread || existingThread.messageCount !== thread.message_count
  })

  bar.start(filteredThreads.length, 0)

  const threadSegments = segmentArray(filteredThreads, 10)
  const populatedThreads: any[] = []

  for (const segment of threadSegments) {
    const threadPromises = segment.map(async (thread) => {
      const messages = await fetchFromDiscord(`/channels/${thread.id}/messages`, 'messages')
      return createSanitizedThread(thread, messages)
    })

    const sanitizedThreads = await Promise.all(threadPromises)
    populatedThreads.push(...sanitizedThreads)
    bar.update(populatedThreads.length)
  }

  bar.stop()

  const cookieStore = await cookies()
  const token = cookieStore.get('payload-token')

  if (!token) {
    throw new Error('You are unauthorized, please log in.')
  }

  const populateAll = populatedThreads.map(async (thread) => {
    const threadExists = existingThreadIDs.some((existing) => existing.id === thread.info.id)
    const body = JSON.stringify({
      slug: thread.slug,
      communityHelpJSON: thread,
      communityHelpType: 'discord',
      discordID: thread.info.id,
      title: thread.info.name,
    })

    const endpoint = threadExists
      ? `${NEXT_PUBLIC_CMS_URL}/api/community-help?${qs.stringify({
          depth: 0,
          where: { discordID: { equals: thread.info.id } },
        })}`
      : `${NEXT_PUBLIC_CMS_URL}/api/community-help`

    const method = threadExists ? 'PATCH' : 'POST'

    await fetch(endpoint, {
      body,
      headers: {
        Authorization: `JWT ${token.value}`,
        'Content-Type': 'application/json',
      },
      method,
    })
  })

  await Promise.all(populateAll)
  console.timeEnd('Populating Discord')
}

export default fetchDiscord
