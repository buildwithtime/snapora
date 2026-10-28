import { ErrorCode } from '../utils/errors.js';

export interface MediaItem {
  type: 'image' | 'video';
  url: string;
  width?: number;
  height?: number;
  filename: string;
  thumbnailUrl?: string;
}

export interface ResolveSuccess {
  ok: true;
  shortcode: string;
  media: MediaItem[];
  title?: string;
  author?: string;
}

export interface ResolveFailure {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
  };
}

export type ResolveResult = ResolveSuccess | ResolveFailure;

export interface IMediaProvider {
  name: string;
  canResolve(url: string): boolean;
  resolve(url: string, shortcode: string): Promise<ResolveResult>;
}
