// app/usePreventBack.js

import { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import React from 'react';

/**
 * usePreventBack - Custom hook to prevent back navigation.
 *
 * Disables the back button on Android and swipe-back gesture on iOS.
 * Should be used inside any screen component where back navigation is to be prevented.
 */
const usePreventBack = () => {
    const navigation = useNavigation();

    useEffect(() => {
        // Disable swipe back gesture on iOS
        navigation.setOptions({ gestureEnabled: false });
    }, [navigation]);

    useFocusEffect(
        React.useCallback(() => {
            const onBackPress = () => true; // Prevent back action

            // Add event listener for Android back button
            BackHandler.addEventListener('hardwareBackPress', onBackPress);

            return () => {
                // Remove event listener on cleanup
                BackHandler.removeEventListener('hardwareBackPress', onBackPress);
            };
        }, [])
    );
};

export default usePreventBack;
