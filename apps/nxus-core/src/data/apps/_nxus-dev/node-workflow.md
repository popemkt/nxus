# Node Architecture Workflow

Set `ARCHITECTURE_TYPE='node'` in `config/feature-flags.ts`

## Fresh Setup

1. Create system schema:
   {{command:bootstrap}}

2. Populate all data:
   {{command:seed-nodes}}

## After UI Changes

Export to manifest files:
{{command:export}}

## Full Reset

Wipe and re-seed:
{{command:reset-nodes}}

## Debugging

View any node:
{{command:inspect}}
