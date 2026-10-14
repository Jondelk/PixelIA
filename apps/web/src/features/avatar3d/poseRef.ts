import type { RefObject } from 'react';
import type { Pose } from './pose';

/** Pose actual (ya interpolada) que el controlador actualiza en cada frame. */
export type PoseRef = RefObject<Pose>;
