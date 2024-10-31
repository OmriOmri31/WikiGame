// app/GameScreen.js

import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Text,
    ActivityIndicator,
    StyleSheet,
    Platform,
    SafeAreaView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import usePreventBack from './usePreventBack';

/**
 * GameScreen - Main game screen where the user navigates from a start article to a target article.
 *
 * @component
 * @returns {JSX.Element} The GameScreen component.
 */
const GameScreen = () => {
    usePreventBack(); // Prevent back navigation

    const [startArticleUrl, setStartArticleUrl] = useState(null);
    const [targetArticleTitle, setTargetArticleTitle] = useState('');
    const [targetArticleUrl, setTargetArticleUrl] = useState('');
    const [gameStartTime, setGameStartTime] = useState(null);
    const [elapsedTime, setElapsedTime] = useState(0); // New state for elapsed time
    const router = useRouter();

    const webViewRef = useRef(null);
    const intervalRef = useRef(null);

    useEffect(() => {
        /**
         * Fetches a random article title from Hebrew Wikipedia.
         *
         * @async
         * @returns {Promise<string>} The title of a random article.
         */
        const fetchRandomArticleTitle = async () => {
            const response = await fetch(
                'https://he.wikipedia.org/w/api.php?action=query&format=json&list=random&rnnamespace=0&rnlimit=1&origin=*'
            );
            const data = await response.json();
            return data.query.random[0].title;
        };

        /**
         * Initializes the game by fetching different start and target articles.
         */
        const initializeGame = async () => {
            try {
                // Fetch random start article
                const startTitle = await fetchRandomArticleTitle();

                // Initialize targetTitle
                let targetTitle = startTitle;

                // Keep fetching until targetTitle is different from startTitle
                while (targetTitle === startTitle) {
                    targetTitle = await fetchRandomArticleTitle();
                }

                // Set URLs and titles
                const startUrl = `https://he.wikipedia.org/wiki/${encodeURIComponent(
                    startTitle
                )}`;
                const targetUrl = `https://he.wikipedia.org/wiki/${encodeURIComponent(
                    targetTitle
                )}`;

                setStartArticleUrl(startUrl);
                setTargetArticleTitle(targetTitle);
                setTargetArticleUrl(targetUrl);

                // Start the game timer
                setGameStartTime(Date.now());
            } catch (error) {
                console.error('Error initializing game:', error);
            }
        };

        initializeGame();

        // Cleanup function
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    useEffect(() => {
        let timerInterval;

        if (gameStartTime) {
            // Start the timer interval
            timerInterval = setInterval(() => {
                const currentTime = Date.now();
                setElapsedTime(Math.floor((currentTime - gameStartTime) / 1000));
            }, 1000);
        }

        return () => {
            // Clean up the timer interval
            if (timerInterval) {
                clearInterval(timerInterval);
            }
        };
    }, [gameStartTime]);

    /**
     * Handles navigation state changes in the WebView to detect when the target article is reached.
     *
     * @param {object} navState - The navigation state of the WebView.
     */
    const handleNavigationChange = (navState) => {
        const { url } = navState;

        // Decode URLs for accurate comparison
        const currentUrlDecoded = decodeURIComponent(url);
        const targetUrlDecoded = decodeURIComponent(targetArticleUrl);

        // Extract the article title from the current URL
        const currentTitleMatch = currentUrlDecoded.match(/wiki\/([^#?]+)/);
        const currentTitle = currentTitleMatch ? currentTitleMatch[1] : '';

        // Extract the article title from the target URL
        const targetTitleMatch = targetUrlDecoded.match(/wiki\/([^#?]+)/);
        const targetTitleExtracted = targetTitleMatch ? targetTitleMatch[1] : '';

        // Normalize titles
        const normalizedCurrentTitle = currentTitle.replace(/_/g, ' ').trim();
        const normalizedTargetTitle = targetTitleExtracted.replace(/_/g, ' ').trim();

        // Log the normalized current and target titles for debugging
        console.log('Normalized Current Article:', normalizedCurrentTitle);
        console.log('Normalized Target Article:', normalizedTargetTitle);

        // Compare titles
        if (normalizedCurrentTitle === normalizedTargetTitle) {
            console.log('User reached the target article.');

            // Use the elapsedTime state variable
            const timeTaken = elapsedTime;

            console.log(`Navigating to WinnerPage with timeTaken=${timeTaken}`);

            // Navigate to WinnerPage with time taken as a query parameter
            router.replace(`/WinnerPage?timeTaken=${encodeURIComponent(String(timeTaken))}`);
        }
    };

    if (!startArticleUrl || !targetArticleUrl) {
        // Show a loading indicator while initializing the game
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3366CC" />
            </View>
        );
    }

    // Render the game screen
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.targetText}>מטרה: {targetArticleTitle}</Text>
                <Text style={styles.timerText}>זמן: {elapsedTime} שניות</Text>
            </View>
            {Platform.OS === 'web' ? (
                // Existing iframe code
                <iframe
                    ref={webViewRef}
                    src={startArticleUrl}
                    style={styles.webview}
                    title="Wikipedia Game"
                    sandbox="allow-same-origin allow-scripts"
                    onLoad={() => {
                        const iframe = webViewRef.current;
                        if (iframe) {
                            const checkUrl = () => {
                                try {
                                    const currentUrl = iframe.contentWindow.location.href;
                                    handleNavigationChange({ url: currentUrl });
                                } catch (e) {
                                    // Cross-origin error handling
                                    console.error('Cannot access iframe content:', e);
                                }
                            };

                            // Check URL on initial load
                            checkUrl();

                            // Set up an interval to check the URL periodically
                            intervalRef.current = setInterval(checkUrl, 1000); // Check every second
                        }
                    }}
                />
            ) : (
                // For native platforms, use react-native-webview
                <WebView
                    source={{ uri: startArticleUrl }}
                    onNavigationStateChange={handleNavigationChange}
                    startInLoadingState
                    renderLoading={() => (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#3366CC" />
                        </View>
                    )}
                />
            )}
        </SafeAreaView>
    );
};

export default GameScreen;

/**
 * Styles for GameScreen
 */
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff',
    },
    header: {
        alignItems: 'center',
        marginVertical: 30,
    },
    targetText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#000000',
    },
    timerText: {
        fontSize: 16,
        color: '#000000',
        marginTop: 5,
    },
    webview: {
        flex: 1,
        width: '100%',
        height: '100%',
        borderWidth: 0,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
