import type { ModelRequestMessage } from './system-prompt-experiment.ts';
import { buildUserProfileSystemBody, buildUserProfileSystemMessage } from './user-profile-experiment.ts';
import { expertQuestionIntent, hasExpertQuestionPrefix } from './marker-question-prefix.ts';

export type CanonicalSystemInputs = {
  systemProfile?: string | null;
  userProfile?: string | null;
  markerQuestions?: readonly string[];
};

type LogicalSystemSection = {
  heading: 'ATT-CHAT CONTEXT' | 'SYSTEM PROFILE' | 'USER PROFILE';
  content: string;
};

function hasSectionHeading(content: string, heading: LogicalSystemSection['heading']) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^(?:#{1,6}\\s+)?${escaped}(?:\\r?\\n|$)`, 'i').test(content.trimStart());
}

function renderSection(section: LogicalSystemSection) {
  return hasSectionHeading(section.content, section.heading)
    ? section.content
    : `# ${section.heading}\n${section.content}`;
}

/**
 * Converts the logical Att-Chat context, System Profile, and User Profile into
 * at most one physical system message. Non-system messages keep their order.
 */
export function canonicalizeSystemMessages<T extends ModelRequestMessage>(
  baseMessages: readonly T[],
  { systemProfile = null, userProfile = null, markerQuestions = [] }: CanonicalSystemInputs = {},
): Array<T | ModelRequestMessage> {
  const internalSystemMessages = baseMessages.filter(message => message.role === 'system');
  const nonSystemMessages = baseMessages.filter(message => message.role !== 'system');
  const sections: LogicalSystemSection[] = [];

  const context = internalSystemMessages.map(message => message.content);
  if (markerQuestions.some(hasExpertQuestionPrefix)) context.push(expertQuestionIntent);
  if (context.length > 0) {
    sections.push({
      heading: 'ATT-CHAT CONTEXT',
      content: context.join('\n\n'),
    });
  }
  if (systemProfile) sections.push({ heading: 'SYSTEM PROFILE', content: systemProfile });
  if (userProfile) sections.push({ heading: 'USER PROFILE', content: buildUserProfileSystemBody(userProfile) });

  if (sections.length === 0) return [...nonSystemMessages];

  let content: string;
  if (sections.length === 1) {
    const only = sections[0];
    if (only.heading === 'USER PROFILE') content = buildUserProfileSystemMessage(userProfile!);
    else content = only.content;
  } else {
    content = sections.map(renderSection).join('\n\n');
  }

  return [{ role:'system', content }, ...nonSystemMessages];
}
