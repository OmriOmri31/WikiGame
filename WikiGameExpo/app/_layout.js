// app/_layout.js

import React from 'react';
import { Stack } from 'expo-router';

/**
 * RootLayout - Defines the navigation stack for Expo Router with custom settings.
 *
 * @returns {JSX.Element} The navigation stack.
 */
const RootLayout = () => {
    return (
        <Stack
            screenOptions={{
                headerShown: false, // Hide headers on all screens
                gestureEnabled: false, // Disable swipe back gesture
            }}
        />
    );
};

export default RootLayout;
