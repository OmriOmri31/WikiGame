// app/index.js

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * SplashScreen - Displays the app's splash screen with animated text.
 * Navigates to HomeScreen after the animation.
 *
 * @component
 * @returns {JSX.Element} The SplashScreen component.
 */
const SplashScreen = () => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const router = useRouter();

    useEffect(() => {
        // Slower fade-in animation (4 seconds)
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 4000, // 4 seconds
            useNativeDriver: true,
        }).start(() => {
            // Navigate to HomeScreen after animation
            router.replace('/HomeScreen');
        });
    }, [fadeAnim, router]);

    return (
        <View style={styles.container}>
            <Animated.Text style={[styles.title, { opacity: fadeAnim }]}>
                משחק הויקיפדיה
            </Animated.Text>
        </View>
    );
};

export default SplashScreen;

/**
 * Styles for SplashScreen
 */
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff', // Wikipedia white
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        fontFamily: 'serif', // Similar to Wikipedia font
        color: '#000000',
    },
});
