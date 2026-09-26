// Provider-side format constraints supplement, never replace, server validation.
const string = { type: 'string' };
const strings = { type: 'array', items: string, minItems: 1 };
const object = (properties: Record<string, unknown>) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
});
const task = object({
  schema_version: { type: 'integer', const: 1 },
  public_task: object({ title: string, question: string }),
  private_task: object({ learning_goal: string, completion_criteria: strings }),
  reference: object({ answer_summary: string, solution_steps: strings, rubric_mapping: strings, common_mistakes: strings }),
});
export function responseFormat(role: 'task' | 'tutor', allowedExplanations: string[] = []) {
  const explanation = { type: 'string', enum: allowedExplanations };
  const tutor = { anyOf: [
    object({ action: { const: 'ask_question' }, explanation, next_question: string }),
    object({ action: { const: 'explain' }, explanation }),
  ] };
  return { type: 'json_schema', json_schema: { name: `study_p0_${role}`, strict: true, schema: role === 'task' ? task : tutor } };
}
