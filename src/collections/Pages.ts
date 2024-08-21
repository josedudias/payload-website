import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access/isAdmin'
import { publishedOnly } from '../access/publishedOnly'
import { CallToAction } from '../blocks/CallToAction'
import { Callout } from '../blocks/Callout'
import { CardGrid } from '../blocks/CardGrid'
import { CaseStudiesHighlight } from '../blocks/CaseStudiesHighlight'
import { CaseStudyCards } from '../blocks/CaseStudyCards'
import { CaseStudyParallax } from '../blocks/CaseStudyParallax'
import { CodeFeature } from '../blocks/CodeFeature'
import { Content } from '../blocks/Content'
import { ContentGrid } from '../blocks/ContentGrid'
import { ExampleTabs } from '../blocks/ExampleTabs'
import { Form } from '../blocks/Form'
import { HoverCards } from '../blocks/HoverCards'
import { HoverHighlights } from '../blocks/HoverHighlights'
import { LinkGrid } from '../blocks/LinkGrid'
import { LogoGrid } from '../blocks/LogoGrid'
import { MediaBlock } from '../blocks/Media'
import { MediaContent } from '../blocks/MediaContent'
import { MediaContentAccordion } from '../blocks/MediaContentAccordion'
import { Pricing } from '../blocks/Pricing'
import { ReusableContent } from '../blocks/ReusableContent'
import { Slider } from '../blocks/Slider'
import { Statement } from '../blocks/Statement'
import { Steps } from '../blocks/Steps'
import { StickyHighlights } from '../blocks/StickyHighlights'
import { fullTitle } from '../fields/fullTitle'
import { hero } from '../fields/hero'
import { slugField } from '../fields/slug'
import { formatPreviewURL } from '../utilities/formatPreviewURL'
import { revalidatePage } from '../utilities/revalidatePage'

export const Pages: CollectionConfig = {
  slug: 'pages',
  access: {
    create: isAdmin,
    delete: isAdmin,
    read: publishedOnly,
    readVersions: isAdmin,
    update: isAdmin,
  },
  admin: {
    defaultColumns: ['fullTitle', 'slug', 'createdAt', 'updatedAt'],
    preview: doc => formatPreviewURL('pages', doc),
    useAsTitle: 'fullTitle',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    fullTitle,
    {
      type: 'tabs',
      tabs: [
        {
          fields: [hero],
          label: 'Hero',
        },
        {
          fields: [
            {
              name: 'layout',
              type: 'blocks',
              blocks: [
                Callout,
                CallToAction,
                CardGrid,
                CaseStudyCards,
                CaseStudiesHighlight,
                CaseStudyParallax,
                CodeFeature,
                Content,
                ContentGrid,
                Form,
                HoverCards,
                HoverHighlights,
                LinkGrid,
                LogoGrid,
                MediaBlock,
                MediaContent,
                MediaContentAccordion,
                Pricing,
                ReusableContent,
                Slider,
                Statement,
                Steps,
                StickyHighlights,
                ExampleTabs,
              ],
              required: true,
            },
          ],
          label: 'Content',
        },
      ],
    },
    slugField(),
  ],
  hooks: {
    afterChange: [
      ({ doc, req: { payload } }) => {
        revalidatePage({
          collection: 'pages',
          doc,
          payload,
        })
      },
    ],
  },
  versions: {
    drafts: true,
  },
}
