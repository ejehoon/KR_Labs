import { LabSize } from './types';

export const calculateLabSize = (memberCount: number): LabSize => {
  if (memberCount >= 20) {
    return 'large';
  } else if (memberCount >= 8) {
    return 'medium';
  } else {
    return 'small';
  }
};

export const LAB_SIZE_CRITERIA = {
  large: '20명 이상',
  medium: '8-19명',
  small: '7명 이하'
} as const;
