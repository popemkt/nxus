import { z } from 'zod'

export const InstallParamsSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  targetPath: z.string(),
})

export type InstallParams = z.infer<typeof InstallParamsSchema>
