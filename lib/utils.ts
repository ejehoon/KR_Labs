import { LabSize } from './types';

export const calculateLabSize = (memberCount: number): LabSize => {
  if (memberCount >= 10) {
    return 'large';
  } else if (memberCount >= 5) {
    return 'medium';
  } else {
    return 'small';
  }
};

export const LAB_SIZE_CRITERIA = {
  large: '10명 이상',
  medium: '5-9명',
  small: '4명 이하'
} as const;
