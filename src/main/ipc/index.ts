import { registerAppHandlers } from './handlers/app';
import { registerPromptHandlers } from './handlers/prompts';
import { registerTagHandlers } from './handlers/tags';
import { registerImageHandlers } from './handlers/images';
import { registerSearchHandlers } from './handlers/search';

export function registerAllHandlers(): void {
  registerAppHandlers();
  registerPromptHandlers();
  registerTagHandlers();
  registerImageHandlers();
  registerSearchHandlers();
}
