import React from 'react';
import { Composition } from 'remotion';
import { Film, DURATION } from './Film';
import { FPS, H, W } from './lib';

export const Root: React.FC = () => (
  <Composition id="TeekLaunchFilm" component={Film} durationInFrames={DURATION} fps={FPS} width={W} height={H} />
);
