import type { TSCommand } from '@nxus-core/types/command';
import type { CommandHandler } from '../index';

/**
 * Global TypeScript commands available to all apps
 * Add custom integration commands here (e.g., push to Notion, send to Telegram)
 */
export const commands: TSCommand[] = [
  // Example (uncomment when ready to implement):
  // {
  //   id: 'push-to-notion',
  //   name: 'Push to Notion',
  //   description: 'Export app info to a Notion database',
  //   icon: 'Export',
  //   category: 'Integration',
  //   target: 'app',
  //   handler: 'pushToNotion',
  // },
];

/**
 * Handler implementations for global commands
 * ⚠️ Handlers must match the 'handler' field in commands above
 */
export const handlers: Record<string, CommandHandler> = {
  // Example (uncomment when ready to implement):
  // pushToNotion: async (ctx) => {
  //   const { app } = ctx
  //   // Notion API integration here
  //   console.log('Pushing to Notion:', app.name)
  // },
};
