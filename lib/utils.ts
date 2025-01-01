import { LabSize } from './types';

export function calculateLabSize(memberCount: number | null): LabSize | 'unknown' {
  if (memberCount === null) return 'unknown';
  if (memberCount >= LAB_SIZE_CRITERIA.large) return 'large';
  if (memberCount >= LAB_SIZE_CRITERIA.medium) return 'medium';
  return 'small';
}

export const LAB_SIZE_CRITERIA = {
  large: '20명 이상',
  medium: '8-19명',
  small: '7명 이하'
} as const;

