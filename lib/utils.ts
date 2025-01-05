import { LabSize } from './types';

// 기준값을 숫자로 정의
const LAB_SIZE_THRESHOLDS = {
  large: 20,
  medium: 8
} as const;

// 표시용 텍스트는 별도로 정의
export const LAB_SIZE_CRITERIA: Record<LabSize, string> = {
  small: '7명 이하',
  medium: '8-19명',
  large: '20명 이상',
  unknown: '알 수 없음'
} as const;

export function calculateLabSize(memberCount: number | null): LabSize {
  // null이거나 0명일 경우 'unknown' 반환
  if (memberCount === null || memberCount === 0) return 'unknown';
  
  if (memberCount >= LAB_SIZE_THRESHOLDS.large) return 'large';
  if (memberCount >= LAB_SIZE_THRESHOLDS.medium) return 'medium';
  return 'small';
}




