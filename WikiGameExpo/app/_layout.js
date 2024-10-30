// app/_layout.js

import React from 'react';
import { Stack } from 'expo-router';

/**
 * RootLayout - Defines the navigation stack for Expo Router with hidden headers.
 *
 * @returns {JSX.Element} The navigation stack.
 */
const RootLayout = () => {
    return <Stack screenOptions={{ headerShown: false }} />;
};

export default RootLayout;
