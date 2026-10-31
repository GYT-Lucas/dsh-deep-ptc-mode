import { Config, apply as applyAskUser, inject } from '@deepseek-ai/dsh-tool-ask-user';
import { adaptContext } from './adapt.mjs';
import { steerableQuestions, steeringWatch } from './reachable.mjs';

export const name = 'deep-ptc-tool-ask-user';
export { Config, inject };

// The official question tool. In timed mode a question the user leaves unanswered becomes pending,
// and a message the user writes instead ends the wait early.
export function apply(ctx, config) {
  const watch = steeringWatch(ctx);
  applyAskUser(adaptContext(ctx, { userQuestions: questions => steerableQuestions(questions, watch) }), config);
}
