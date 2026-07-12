/**
 * system-field-definitions.ts — the ONE hand-written list of system field
 * definitions (systemId, content name, field type). SQLite bootstrap and
 * the SurrealDB field bootstrap both derive from it; the two previously
 * carried separate lists that drifted 47 fields apart (field:formula,
 * field:todo_state, the whole recall family missing on the graph side).
 *
 * The three meta fields (field:supertag, field:extends, field:field_type)
 * are NOT here — SQLite creates them in an earlier bootstrap step with
 * special handling; surreal-schema prepends them locally.
 */

import { SYSTEM_FIELDS } from './node-schema.js'

export interface SystemFieldDefinition {
  systemId: string
  content: string
  fieldType: string
}

export const SYSTEM_FIELD_DEFINITIONS: SystemFieldDefinition[] = [
  { systemId: SYSTEM_FIELDS.TYPE, content: 'type', fieldType: 'select' },
  { systemId: SYSTEM_FIELDS.PATH, content: 'path', fieldType: 'text' },
  { systemId: SYSTEM_FIELDS.HOMEPAGE, content: 'homepage', fieldType: 'url' },
  {
    systemId: SYSTEM_FIELDS.DESCRIPTION,
    content: 'description',
    fieldType: 'text',
  },
  { systemId: SYSTEM_FIELDS.COLOR, content: 'color', fieldType: 'text' },
  { systemId: SYSTEM_FIELDS.ICON, content: 'icon', fieldType: 'text' },
  {
    systemId: SYSTEM_FIELDS.LEGACY_ID,
    content: 'legacyId',
    fieldType: 'text',
  },
  {
    systemId: SYSTEM_FIELDS.DEPENDENCIES,
    content: 'dependencies',
    fieldType: 'nodes',
  },
  { systemId: SYSTEM_FIELDS.TAGS, content: 'tags', fieldType: 'nodes' },
  {
    systemId: SYSTEM_FIELDS.COMMANDS,
    content: 'commands',
    fieldType: 'nodes',
  },
  { systemId: SYSTEM_FIELDS.PARENT, content: 'parent', fieldType: 'node' },
  { systemId: SYSTEM_FIELDS.ORDER, content: 'order', fieldType: 'number' },
  {
    systemId: SYSTEM_FIELDS.CHECK_COMMAND,
    content: 'checkCommand',
    fieldType: 'text',
  },
  {
    systemId: SYSTEM_FIELDS.INSTALL_INSTRUCTIONS,
    content: 'installInstructions',
    fieldType: 'text',
  },
  {
    systemId: SYSTEM_FIELDS.CATEGORY,
    content: 'category',
    fieldType: 'text',
  },
  {
    systemId: SYSTEM_FIELDS.PLATFORM,
    content: 'platform',
    fieldType: 'json',
  },
  { systemId: SYSTEM_FIELDS.DOCS, content: 'docs', fieldType: 'json' },
  // Command-specific
  { systemId: SYSTEM_FIELDS.COMMAND, content: 'command', fieldType: 'text' },
  {
    systemId: SYSTEM_FIELDS.COMMAND_ID,
    content: 'commandId',
    fieldType: 'text',
  },
  { systemId: SYSTEM_FIELDS.MODE, content: 'mode', fieldType: 'select' },
  { systemId: SYSTEM_FIELDS.TARGET, content: 'target', fieldType: 'select' },
  {
    systemId: SYSTEM_FIELDS.SCRIPT_SOURCE,
    content: 'scriptSource',
    fieldType: 'text',
  },
  { systemId: SYSTEM_FIELDS.CWD, content: 'cwd', fieldType: 'text' },
  {
    systemId: SYSTEM_FIELDS.PLATFORMS,
    content: 'platforms',
    fieldType: 'json',
  },
  {
    systemId: SYSTEM_FIELDS.REQUIRES,
    content: 'requires',
    fieldType: 'json',
  },
  { systemId: SYSTEM_FIELDS.OPTIONS, content: 'options', fieldType: 'json' },
  { systemId: SYSTEM_FIELDS.PARAMS, content: 'params', fieldType: 'json' },
  {
    systemId: SYSTEM_FIELDS.REQUIREMENTS,
    content: 'requirements',
    fieldType: 'json',
  },
  {
    systemId: SYSTEM_FIELDS.WORKFLOW,
    content: 'workflow',
    fieldType: 'json',
  },
  // Inbox-specific
  { systemId: SYSTEM_FIELDS.STATUS, content: 'status', fieldType: 'select' },
  { systemId: SYSTEM_FIELDS.NOTES, content: 'notes', fieldType: 'text' },
  { systemId: SYSTEM_FIELDS.TITLE, content: 'title', fieldType: 'text' },
  { systemId: SYSTEM_FIELDS.ARCHIVED_AT, content: 'archivedAt', fieldType: 'text' },
  // Query-specific (for saved queries with supertag:query)
  {
    systemId: SYSTEM_FIELDS.QUERY_DEFINITION,
    content: 'queryDefinition',
    fieldType: 'json',
  },
  {
    systemId: SYSTEM_FIELDS.QUERY_SORT,
    content: 'querySort',
    fieldType: 'json',
  },
  {
    systemId: SYSTEM_FIELDS.QUERY_LIMIT,
    content: 'queryLimit',
    fieldType: 'number',
  },
  {
    systemId: SYSTEM_FIELDS.QUERY_RESULT_CACHE,
    content: 'queryResultCache',
    fieldType: 'json',
  },
  {
    systemId: SYSTEM_FIELDS.QUERY_EVALUATED_AT,
    content: 'queryEvaluatedAt',
    fieldType: 'text',
  },
  {
    systemId: SYSTEM_FIELDS.BASE_TYPE,
    content: 'baseType',
    fieldType: 'select',
  },
  // Automation-specific fields
  {
    systemId: SYSTEM_FIELDS.AUTOMATION_DEFINITION,
    content: 'automationDefinition',
    fieldType: 'json',
  },
  {
    systemId: SYSTEM_FIELDS.AUTOMATION_STATE,
    content: 'automationState',
    fieldType: 'json',
  },
  {
    systemId: SYSTEM_FIELDS.AUTOMATION_LAST_FIRED,
    content: 'automationLastFired',
    fieldType: 'text',
  },
  {
    systemId: SYSTEM_FIELDS.AUTOMATION_ENABLED,
    content: 'automationEnabled',
    fieldType: 'boolean',
  },
  // Computed field-specific fields
  {
    systemId: SYSTEM_FIELDS.COMPUTED_FIELD_DEFINITION,
    content: 'computedFieldDefinition',
    fieldType: 'json',
  },
  {
    systemId: SYSTEM_FIELDS.COMPUTED_FIELD_VALUE,
    content: 'computedFieldValue',
    fieldType: 'number',
  },
  {
    systemId: SYSTEM_FIELDS.COMPUTED_FIELD_UPDATED_AT,
    content: 'computedFieldUpdatedAt',
    fieldType: 'text',
  },
  // Calendar-specific fields
  {
    systemId: SYSTEM_FIELDS.START_DATE,
    content: 'start_date',
    fieldType: 'text',
  },
  {
    systemId: SYSTEM_FIELDS.END_DATE,
    content: 'end_date',
    fieldType: 'text',
  },
  {
    systemId: SYSTEM_FIELDS.ALL_DAY,
    content: 'all_day',
    fieldType: 'boolean',
  },
  {
    systemId: SYSTEM_FIELDS.RRULE,
    content: 'rrule',
    fieldType: 'text',
  },
  {
    systemId: SYSTEM_FIELDS.GCAL_EVENT_ID,
    content: 'gcal_event_id',
    fieldType: 'text',
  },
  {
    systemId: SYSTEM_FIELDS.GCAL_SYNCED_AT,
    content: 'gcal_synced_at',
    fieldType: 'text',
  },
  {
    systemId: SYSTEM_FIELDS.REMINDER,
    content: 'reminder',
    fieldType: 'number',
  },
  // Google Calendar OAuth fields (stored on settings node)
  {
    systemId: SYSTEM_FIELDS.GCAL_ACCESS_TOKEN,
    content: 'gcal_access_token',
    fieldType: 'text',
  },
  {
    systemId: SYSTEM_FIELDS.GCAL_REFRESH_TOKEN,
    content: 'gcal_refresh_token',
    fieldType: 'text',
  },
  {
    systemId: SYSTEM_FIELDS.GCAL_TOKEN_EXPIRY,
    content: 'gcal_token_expiry',
    fieldType: 'text',
  },
  {
    systemId: SYSTEM_FIELDS.GCAL_USER_EMAIL,
    content: 'gcal_user_email',
    fieldType: 'text',
  },
  {
    systemId: SYSTEM_FIELDS.GCAL_CALENDAR_ID,
    content: 'gcal_calendar_id',
    fieldType: 'text',
  },
  // Recall training fields
  { systemId: SYSTEM_FIELDS.RECALL_SUMMARY, content: 'recallSummary', fieldType: 'text' },
  { systemId: SYSTEM_FIELDS.RECALL_WHY_IT_MATTERS, content: 'recallWhyItMatters', fieldType: 'text' },
  { systemId: SYSTEM_FIELDS.RECALL_BLOOMS_LEVEL, content: 'recallBloomsLevel', fieldType: 'node' },
  { systemId: SYSTEM_FIELDS.RECALL_CURRENT_BLOOMS_LEVEL, content: 'recallCurrentBloomsLevel', fieldType: 'node' },
  { systemId: SYSTEM_FIELDS.RECALL_SOURCE, content: 'recallSource', fieldType: 'text' },
  { systemId: SYSTEM_FIELDS.RECALL_RELATED_CONCEPTS, content: 'recallRelatedConcepts', fieldType: 'nodes' },
  { systemId: SYSTEM_FIELDS.RECALL_DUE, content: 'recallDue', fieldType: 'text' },
  { systemId: SYSTEM_FIELDS.RECALL_STABILITY, content: 'recallStability', fieldType: 'number' },
  { systemId: SYSTEM_FIELDS.RECALL_DIFFICULTY, content: 'recallDifficulty', fieldType: 'number' },
  { systemId: SYSTEM_FIELDS.RECALL_ELAPSED_DAYS, content: 'recallElapsedDays', fieldType: 'number' },
  { systemId: SYSTEM_FIELDS.RECALL_SCHEDULED_DAYS, content: 'recallScheduledDays', fieldType: 'number' },
  { systemId: SYSTEM_FIELDS.RECALL_REPS, content: 'recallReps', fieldType: 'number' },
  { systemId: SYSTEM_FIELDS.RECALL_LAPSES, content: 'recallLapses', fieldType: 'number' },
  { systemId: SYSTEM_FIELDS.RECALL_STATE, content: 'recallState', fieldType: 'number' },
  { systemId: SYSTEM_FIELDS.RECALL_LAST_REVIEW, content: 'recallLastReview', fieldType: 'text' },
  { systemId: SYSTEM_FIELDS.RECALL_QUESTION_TEXT, content: 'recallQuestionText', fieldType: 'text' },
  { systemId: SYSTEM_FIELDS.RECALL_QUESTION_TYPE, content: 'recallQuestionType', fieldType: 'select' },
  { systemId: SYSTEM_FIELDS.RECALL_USER_ANSWER, content: 'recallUserAnswer', fieldType: 'text' },
  { systemId: SYSTEM_FIELDS.RECALL_AI_FEEDBACK, content: 'recallAiFeedback', fieldType: 'text' },
  { systemId: SYSTEM_FIELDS.RECALL_RATING, content: 'recallRating', fieldType: 'number' },
  { systemId: SYSTEM_FIELDS.RECALL_CACHED_QUESTION, content: 'recallCachedQuestion', fieldType: 'json' },
  { systemId: SYSTEM_FIELDS.RECALL_REVIEW_STATE, content: 'recallReviewState', fieldType: 'number' },
  { systemId: SYSTEM_FIELDS.RECALL_REVIEW_SCORE, content: 'recallReviewScore', fieldType: 'number' },
  { systemId: SYSTEM_FIELDS.RECALL_REVIEW_TIME_SPENT_MS, content: 'recallReviewTimeSpentMs', fieldType: 'number' },
  { systemId: SYSTEM_FIELDS.RECALL_REVIEW_STABILITY_BEFORE, content: 'recallReviewStabilityBefore', fieldType: 'number' },
  { systemId: SYSTEM_FIELDS.RECALL_REVIEW_DIFFICULTY_BEFORE, content: 'recallReviewDifficultyBefore', fieldType: 'number' },
  { systemId: SYSTEM_FIELDS.RECALL_REVIEW_SCHEDULED_DAYS, content: 'recallReviewScheduledDays', fieldType: 'number' },
  { systemId: SYSTEM_FIELDS.RECALL_REVIEW_HINTS_USED, content: 'recallReviewHintsUsed', fieldType: 'number' },

  // Supertag configuration fields (Tana parity)
  { systemId: SYSTEM_FIELDS.DEFAULT_CHILD_SUPERTAG, content: 'defaultChildSupertag', fieldType: 'node' },
  { systemId: SYSTEM_FIELDS.CONTENT_TEMPLATE, content: 'contentTemplate', fieldType: 'json' },
  { systemId: SYSTEM_FIELDS.REQUIRED, content: 'required', fieldType: 'boolean' },
  { systemId: SYSTEM_FIELDS.HIDE_WHEN, content: 'hideWhen', fieldType: 'select' },
  { systemId: SYSTEM_FIELDS.PINNED, content: 'pinned', fieldType: 'boolean' },
  { systemId: SYSTEM_FIELDS.AUTO_COLLECT, content: 'autoCollect', fieldType: 'boolean' },
  { systemId: SYSTEM_FIELDS.INSTANCE_SUPERTAG, content: 'instanceSupertag', fieldType: 'node' },
  { systemId: SYSTEM_FIELDS.VIEW_AS, content: 'viewAs', fieldType: 'select' },
  { systemId: SYSTEM_FIELDS.VIEW_CONFIG, content: 'viewConfig', fieldType: 'json' },
  // Inline mention backlinks (Tana parity): node-refs extracted from content's
  // [[node:<uuid>]] tokens. Engine-internal — never part of a supertag's
  // instance schema, hidden from field-row rendering (see HIDDEN_FIELD_SYSTEM_IDS).
  { systemId: SYSTEM_FIELDS.MENTIONS, content: 'mentions', fieldType: 'nodes' },
  ]
