export type WorkflowStatus = 'draft' | 'published' | 'disabled'
export type WorkflowScope = 'user' | 'system'

export interface Workflow {
  id: string
  slug: string
  name: string
  description: string
  scope: WorkflowScope
  status: WorkflowStatus
  version: number
  step_count: number
  run_count: number
  updated_at: string
}
