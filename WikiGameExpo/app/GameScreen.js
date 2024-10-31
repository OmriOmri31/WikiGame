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
 * The user is presented with a random start article and must navigate to a random target article.
 * The time taken to reach the target article is recorded and displayed upon completion.
 *
 * @component
 * @returns {JSX.Element} The GameScreen component.
 */
const GameScreen = () => {
    usePreventBack(); // Prevent back navigation

    const [startArticleUrl, setStartArticleUrl] = useState(null);
    const [startArticleTitle, setStartArticleTitle] = useState('');
    const [targetArticleTitle, setTargetArticleTitle] = useState('');
    const [targetArticleUrl, setTargetArticleUrl] = useState('');
    const [gameStartTime, setGameStartTime] = useState(null);
    const [elapsedTime, setElapsedTime] = useState(0); // State for elapsed time
    const [pageVisitCount, setPageVisitCount] = useState(1); // State for page visit count
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
                const startUrl = `https://he.m.wikipedia.org/wiki/${encodeURIComponent(
                    startTitle
                )}`;
                const targetUrl = `https://he.m.wikipedia.org/wiki/${encodeURIComponent(
                    targetTitle
                )}`;

                setStartArticleUrl(startUrl);
                setStartArticleTitle(startTitle);
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
     * JavaScript code to remove the search bar and toolbar from the Wikipedia page.
     */
    const injectedJavaScriptBeforeContentLoaded = `
    (function() {
      var style = document.createElement('style');
      style.innerHTML = \`
        .minerva-search-form, .menu { display: none !important; }
      \`;
      document.head.appendChild(style);
    })();
  `;

    /**
     * Handles navigation state changes in the WebView to detect when the target article is reached.
     *
     * @param {object} navState - The navigation state of the WebView.
     */
    const handleNavigationChange = (navState) => {
        const { url } = navState;

        // Increase page visit count if the URL has changed
        setPageVisitCount((prevCount) => prevCount + 1);

        // Decode URLs for accurate comparison
        const currentUrlDecoded = decodeURIComponent(url);
        const targetUrlDecoded = decodeURIComponent(targetArticleUrl);

        // Extract the article title from the current URL
        const currentTitleMatch = currentUrlDecoded.match(/wiki\/([^#?]+)/);
        const currentTitle = currentTitleMatch ? currentTitleMatch[1] : '';

        // Extract the article title from the target URL
        const targetTitleMatch = targetUrlDecoded.match(/wiki\/([^#?]+)/);
        const targetTitleExtracted = targetTitleMatch ? targetTitleMatch[1] : '';

        // Normalize titles by replacing underscores with spaces
        const normalizedCurrentTitle = currentTitle.replace(/_/g, ' ').trim();
        const normalizedTargetTitle = targetTitleExtracted.replace(/_/g, ' ').trim();

        // Log the normalized current and target titles for debugging
        console.log('Normalized Current Article:', normalizedCurrentTitle);
        console.log('Normalized Target Article:', normalizedTargetTitle);

        // Compare titles
        if (normalizedCurrentTitle === normalizedTargetTitle) {
            console.log('User reached the target article.');

            const timeTaken = elapsedTime;

            console.log(`Navigating to WinnerPage with timeTaken=${timeTaken}`);

            // Navigate to WinnerPage with time taken and target article info
            router.replace(
                `/WinnerPage?timeTaken=${encodeURIComponent(
                    String(timeTaken)
                )}&targetArticleTitle=${encodeURIComponent(
                    targetArticleTitle
                )}&targetArticleUrl=${encodeURIComponent(
                    targetArticleUrl
                )}&pageVisitCount=${encodeURIComponent(
                    String(pageVisitCount)
                )}`
            );
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
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.pagesText}>
                    {startArticleTitle} &#8592; {targetArticleTitle}
                </Text>
                <Text style={styles.counterText}>
                    מספר הדפים: {pageVisitCount}
                </Text>
                <Text style={styles.timerText}>זמן: {elapsedTime} שניות</Text>
            </View>

            {Platform.OS === 'web' ? (
                // For web platform, use iframe
                <iframe
                    ref={webViewRef}
                    src={startArticleUrl}
                    style={styles.webview}
                    title="Wikipedia Game"
                    sandbox="allow-scripts allow-same-origin"
                    onLoad={() => {
                        const iframe = webViewRef.current;
                        if (iframe) {
                            // Inject JavaScript into the iframe
                            iframe.contentWindow.eval(injectedJavaScriptBeforeContentLoaded);
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
                    ref={webViewRef}
                    onNavigationStateChange={handleNavigationChange}
                    injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded}
                    javaScriptEnabled={true}
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
        backgroundColor: '#ffffff', // Ensure background color
    },
    header: {
        position: 'absolute',
        top: 0,
        width: '100%',
        backgroundColor: '#ffffff',
        alignItems: 'center',
        paddingVertical: 35,
        zIndex: 1, // Ensure the header is above the WebView
    },
    pagesText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#000000',
    },
    counterText: {
        fontSize: 14,
        color: '#000000',
        marginTop: 5,
    },
    timerText: {
        fontSize: 14,
        color: '#000000',
        marginTop: 5,
    },
    webview: {
        flex: 1,
        marginTop: 100, // Adjust margin to prevent content from being hidden behind the header
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
