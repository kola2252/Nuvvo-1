/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import LoadingScreen from './LoadingScreen';

function Splash() {
  const { setCurrentPage } = useApp();

  const handleComplete = useCallback(() => {
    setCurrentPage('home');
  }, [setCurrentPage]);

  return (
    <LoadingScreen
      fullScreen={true}
      variant="splash"
      onComplete={handleComplete}
      statusText="Preparing fresh kitchens..."
    />
  );
}

export default React.memo(Splash);

