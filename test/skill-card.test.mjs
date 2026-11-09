import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySkillCommand, blankSkillState, catalogDescriptions, foldSkillState, parseSkillCardView,
  parseSkillState, removeResults, replacementData, skillCardView, skillNameOfResult, skillsToUnload,
  SKILL_DISABLED_MARK,
} from '../lib/skill-card.mjs';

const catalog = { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: [
  '<system-reminder>',
  '<available_skills>',
  '- `office`: Create Office files.',
  '- `research`: Search the web.',
  '</available_skills>',
  '</system-reminder>',
].join('\n') }] } };
const skill = { seq: 2, type: 'tool/result', data: { name: 'skill', callId: 'call-1', message: {
  role: 'tool', name: 'skill', content: [{ type: 'text', text: '<skill_content name="office">secret body</skill_content>' }],
} } };
const turnStart = turn => ({ seq: 10 + turn, type: 'turn/start', data: { turn } });
const turnEnd = turn => ({ seq: 20 + turn, type: 'turn/end', data: { turn } });

test('skill results and catalog descriptions become a card row', () => {
  let state = blankSkillState();
  state = foldSkillState(state, catalog);
  state = foldSkillState(state, turnStart(1));
  state = foldSkillState(state, skill);
  assert.deepEqual(catalogDescriptions('<available_skills>\n- `office`: Office files.\n</available_skills>'), { office: 'Office files.' });
  assert.equal(skillNameOfResult('<skill_content name="office">x</skill_content>'), 'office');
  assert.equal(state.skills.length, 1);
  assert.deepEqual(state.skills[0], { name: 'office', description: 'Create Office files.', enabled: true, loadedTurn: 1, source: 'tool', callId: 'call-1', seqs: [2] });
  state = foldSkillState(state, turnEnd(1));
  assert.deepEqual(skillCardView(state), { v: 1, turn: 1, phase: 'idle', skills: [
    { name: 'office', description: 'Create Office files.', enabled: true, loadedTurn: 1 },
  ] });
});

test('a user command is committed at the next turn and releases the tool result', () => {
  let state = blankSkillState();
  state = foldSkillState(state, catalog);
  state = foldSkillState(state, turnStart(1));
  state = foldSkillState(state, skill);
  state = foldSkillState(state, turnEnd(1));
  state = applySkillCommand(state, JSON.stringify({ action: 'set', name: 'office', enabled: false }));
  assert.equal(state.skills[0].enabled, false);
  assert.deepEqual(skillsToUnload(state), []);
  state = foldSkillState(state, turnStart(2));
  assert.deepEqual(skillsToUnload(state).map(row => row.name), ['office']);
  state = removeResults(state, new Set([2]));
  assert.equal(state.skills.length, 0);
  assert.equal(skillCardView(state).skills.length, 0);
});

test('the disabled marker removes a released result and all-off controls every row', () => {
  let state = blankSkillState();
  state = foldSkillState(state, catalog);
  state = foldSkillState(state, turnStart(1));
  state = foldSkillState(state, skill);
  state = foldSkillState(state, { seq: 3, type: 'tool/result', data: { callId: 'call-1', message: { content: [{ type: 'text', text: SKILL_DISABLED_MARK + ' gone' }] } } });
  assert.equal(state.skills.length, 0);
  let second = foldSkillState(blankSkillState(), turnStart(1));
  second = foldSkillState(second, skill);
  const allOff = applySkillCommand(second, JSON.stringify({ action: 'all', enabled: false }));
  assert.equal(allOff.skills[0].enabled, false);
  assert.equal(applySkillCommand(second, 'not-json'), undefined);
});

test('the projection activates only for a Deep PTC header', () => {
  assert.equal(blankSkillState({ agentPreset: 'deep-ptc' }).active, true);
  assert.equal(blankSkillState({ agentPreset: 'standard' }).active, false);
  assert.equal(blankSkillState().active, true);
});

test('the projection is inert for every non-Deep-PTC session', () => {
  let state = blankSkillState({ agentPreset: 'standard' });
  assert.equal(state.active, false);
  state = foldSkillState(state, turnStart(1));
  state = foldSkillState(state, catalog);
  state = foldSkillState(state, skill);
  state = foldSkillState(state, turnEnd(1));
  assert.equal(state.turn, 0);
  assert.equal(state.phase, 'idle');
  assert.equal(state.skills.length, 0);
  assert.equal(state.descriptions.office, undefined);
  assert.deepEqual(skillCardView(state).skills, []);
});

test('a skill loaded through a PTC inner call is tracked without a tool-result sequence', () => {
  const ptc = { seq: 4, type: 'tool/ptc-dispatch', data: { name: 'skill',
    content: [{ type: 'text', text: '<skill_content name="research">PTC body</skill_content>' }] } };
  let state = blankSkillState();
  state = foldSkillState(state, catalog);
  state = foldSkillState(state, turnStart(1));
  state = foldSkillState(state, ptc);
  assert.deepEqual(state.skills[0], { name: 'research', description: 'Search the web.', enabled: true,
    loadedTurn: 1, source: 'ptc', callId: '', seqs: [] });
  state = foldSkillState(state, turnEnd(1));
  state = applySkillCommand(state, JSON.stringify({ action: 'set', name: 'research', enabled: false }));
  state = foldSkillState(state, turnStart(2));
  assert.deepEqual(skillsToUnload(state).map(row => row.name), ['research']);
});

test('tool output that only quotes the skill template does not become a card row', () => {
  let state = foldSkillState(blankSkillState(), turnStart(1));
  const docs = { seq: 7, type: 'tool/result', data: { name: 'read', message: { content: [
    { type: 'text', text: '180: <skill_content name="office">\n181: example only' }] } } };
  state = foldSkillState(state, docs);
  assert.equal(state.skills.length, 0);
  const escaped = { seq: 8, type: 'tool/result', data: { name: 'read', message: { content: [
    { type: 'text', text: '<skill_content name="<escaped-name>">\nnot a real skill' }] } } };
  state = foldSkillState(state, escaped);
  assert.equal(state.skills.length, 0);
});

test('replacement keeps every tool-result identity field and changes only content', () => {
  const replacement = replacementData(skill, 'office');
  assert.equal(replacement.callId, 'call-1');
  assert.equal(replacement.name, 'skill');
  assert.equal(replacement.message.role, 'tool');
  assert.match(replacement.message.content[0].text, /^\[deep-ptc-skill-disabled\]/u);
  assert.doesNotMatch(JSON.stringify(replacement), /secret body/u);
});

test('state and client view validation reject malformed values', () => {
  assert.throws(() => parseSkillState({ v: 1, turn: -1, phase: 'idle', skills: [], committed: null, descriptions: {} }), /Invalid/u);
  assert.throws(() => parseSkillState({ v: 1, turn: 0, phase: 'idle', skills: [{ name: 'x', description: '', enabled: true, loadedTurn: 0, seqs: [0] }], committed: null, descriptions: {} }), /Invalid/u);
  assert.equal(parseSkillCardView({ v: 1, turn: 0, phase: 'idle', skills: [] }).skills.length, 0);
  assert.throws(() => parseSkillCardView({ v: 1, turn: 0, phase: 'bad', skills: [] }), /Invalid/u);
});
