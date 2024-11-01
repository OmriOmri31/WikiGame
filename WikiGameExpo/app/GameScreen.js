// app/GameScreen.js

import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Text,
    ActivityIndicator,
    StyleSheet,
    Platform,
    SafeAreaView,
    Modal,
    TouchableOpacity,
    BackHandler,
    Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import usePreventBack from './usePreventBack';
import topPages from '../assets/top_articles.json'; // Direct import of JSON

/**
 * GameScreen - Main game screen where the user navigates from a start article to a target article.
 *
 * The user is presented with a random start article and must navigate to a random target article
 * from the top 5000 most visited pages.
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
    const [isTargetModalVisible, setIsTargetModalVisible] = useState(false); // Modal visibility
    const router = useRouter();

    const webViewRef = useRef(null);
    const intervalRef = useRef(null); // Ref to store the interval ID
    const previousUrlRef = useRef(''); // To track previous URL
    const isInitialLoadRef = useRef(true); // Flag to prevent initial load increment

    useEffect(() => {
        /**
         * Fetches a random article title from Hebrew Wikipedia.
         *
         * @async
         * @returns {Promise<string>} The title of a random article.
         */
        const fetchRandomArticleTitle = async () => {
            try {
                const response = await fetch(
                    'https://he.wikipedia.org/w/api.php?action=query&format=json&list=random&rnnamespace=0&rnlimit=1&origin=*'
                );
                const data = await response.json();
                return data.query.random[0].title;
            } catch (error) {
                console.error('Error fetching random article title:', error);
                return 'Main_Page'; // Fallback to Main_Page if fetching fails
            }
        };

        /**
         * Initializes the game by fetching a random start article and a target article
         * from the top 5000 most visited pages.
         */
        const initializeGame = async () => {
            try {
                // Fetch random start article
                const startTitle = await fetchRandomArticleTitle();

                // Load top 5000 pages from imported JSON
                const topPagesList = topPages;

                if (topPagesList.length === 0) {
                    console.error('Top pages list is empty. Cannot initialize target article.');
                    return;
                }

                // Select a random target article from the top pages
                let targetTitle =
                    topPagesList[Math.floor(Math.random() * topPagesList.length)];

                // Ensure targetTitle is different from startTitle
                while (targetTitle === startTitle) {
                    targetTitle =
                        topPagesList[Math.floor(Math.random() * topPagesList.length)];
                }

                // Replace underscores with spaces for better readability
                const formattedStartTitle = startTitle.replace(/_/g, ' ').trim();
                const formattedTargetTitle = targetTitle.replace(/_/g, ' ').trim();

                // Set URLs and formatted titles
                const startUrl = `https://he.m.wikipedia.org/wiki/${encodeURIComponent(
                    startTitle
                )}`;
                const targetUrl = `https://he.m.wikipedia.org/wiki/${encodeURIComponent(
                    targetTitle
                )}`;

                setStartArticleUrl(startUrl);
                setStartArticleTitle(formattedStartTitle);
                setTargetArticleTitle(formattedTargetTitle);
                setTargetArticleUrl(targetUrl);

                // Start the game timer
                setGameStartTime(Date.now());
                previousUrlRef.current = startUrl; // Initialize previous URL
                isInitialLoadRef.current = true; // Set initial load flag
            } catch (error) {
                console.error('Error initializing game:', error);
            }
        };

        initializeGame();

        // Cleanup function for the first useEffect (no interval to clear here)
        return () => {
            // No cleanup needed here since interval is managed in a separate useEffect
        };
    }, []);

    useEffect(() => {
        if (gameStartTime) {
            // Start the timer interval
            intervalRef.current = setInterval(() => {
                const currentTime = Date.now();
                setElapsedTime(Math.floor((currentTime - gameStartTime) / 1000));
            }, 1000);
        }

        // Cleanup function to clear the interval when the component unmounts or gameStartTime changes
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
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

        // Check if this is the initial load
        if (isInitialLoadRef.current) {
            isInitialLoadRef.current = false;
            previousUrlRef.current = url;
            return; // Do not increment counter on initial load
        }

        // Check if the URL has actually changed to a new page
        if (url !== previousUrlRef.current) {
            setPageVisitCount((prevCount) => prevCount + 1);
            previousUrlRef.current = url; // Update previous URL

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
        }
    };

    /**
     * Handles attempts to navigate outside the Wikipedia domain.
     *
     * @param {object} request - The navigation request object.
     * @returns {boolean} - Whether to allow the navigation.
     */
    const handleShouldStartLoadWithRequest = (request) => {
        const url = request.url.toLowerCase();

        try {
            const parsedUrl = new URL(url);
            const hostname = parsedUrl.hostname;

            // Define a regex to match 'he.wikipedia.org' and 'he.*.wikipedia.org'
            const heWikipediaRegex = /^he(\.[a-z]+)?\.wikipedia\.org$/;

            if (heWikipediaRegex.test(hostname)) {
                // Allow navigation within 'he.wikipedia.org' and its subdomains
                return true;
            } else {
                // Deny navigation and show an alert
                Alert.alert("Can't leave the Wikipedia website");
                return false;
            }
        } catch (error) {
            console.error('Invalid URL:', url);
            Alert.alert("Can't leave the Wikipedia website");
            return false;
        }
    };

    // Handle Android hardware back button to close the modal if it's open
    useEffect(() => {
        const backAction = () => {
            if (isTargetModalVisible) {
                setIsTargetModalVisible(false);
                return true; // Prevent default behavior
            }
            return false; // Allow default behavior
        };

        const backHandler = BackHandler.addEventListener(
            'hardwareBackPress',
            backAction
        );

        return () => backHandler.remove();
    }, [isTargetModalVisible]);

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
                {/* First Line: Start Article Name */}
                <View style={styles.titleRow}>
                    <Text style={styles.pagesText}>{startArticleTitle}</Text>
                </View>

                {/* Second Line: Downward Arrow */}
                <View style={styles.arrowRow}>
                    <Text style={styles.arrowText}>↓</Text>
                </View>

                {/* Third Line: Target Article Name */}
                <TouchableOpacity
                    onPress={() => setIsTargetModalVisible(true)}
                    activeOpacity={0.7} // Slight opacity change on press
                    accessibilityLabel={`View target article: ${targetArticleTitle}`}
                    accessibilityRole="button"
                >
                    <Text style={styles.targetTitleText}>{targetArticleTitle}</Text>
                </TouchableOpacity>

                {/* Bottom Row: Timer and Counter */}
                <View style={styles.infoRow}>
                    <Text style={styles.timerText}>זמן: {elapsedTime} שניות</Text>
                    <Text style={styles.counterText}>מספר הדפים: {pageVisitCount}</Text>
                </View>
            </View>

            {/* Main WebView */}
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
                            try {
                                // Inject CSS to hide search bar and toolbar immediately
                                iframe.contentWindow.eval(
                                    injectedJavaScriptBeforeContentLoaded
                                );
                            } catch (error) {
                                console.error(
                                    'Error injecting scripts into iframe:',
                                    error
                                );
                            }
                        }
                    }}
                />
            ) : (
                // For native platforms, use react-native-webview
                <WebView
                    source={{ uri: startArticleUrl }}
                    ref={webViewRef}
                    onNavigationStateChange={handleNavigationChange}
                    injectedJavaScriptBeforeContentLoaded={
                        injectedJavaScriptBeforeContentLoaded
                    }
                    javaScriptEnabled={true}
                    startInLoadingState
                    renderLoading={() => (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#3366CC" />
                        </View>
                    )}
                    style={styles.webview}
                    onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
                    originWhitelist={['https://*', 'http://*']} // Allow all origins initially
                />
            )}

            {/* Modal for Helper Screen */}
            <Modal
                visible={isTargetModalVisible}
                animationType="slide"
                onRequestClose={() => setIsTargetModalVisible(false)}
            >
                <SafeAreaView style={styles.modalContainer}>
                    {/* Modal Header */}
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setIsTargetModalVisible(false)}>
                            <Text style={styles.closeButton}>סגור</Text>
                        </TouchableOpacity>
                        <Text style={styles.modalTitle}>{targetArticleTitle}</Text>
                        {/* Placeholder for alignment */}
                        <View style={{ width: 50 }} />
                    </View>

                    {/* Modal WebView */}
                    <WebView
                        source={{ uri: targetArticleUrl }}
                        style={styles.modalWebview}
                        onShouldStartLoadWithRequest={(request) => {
                            // Allow only the targetArticleUrl to load
                            return request.url === targetArticleUrl;
                        }}
                        startInLoadingState
                        renderLoading={() => (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#3366CC" />
                            </View>
                        )}
                    />
                </SafeAreaView>
            </Modal>
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
        top: 85, // Adjusted as per user change
        width: '100%',
        backgroundColor: '#ffffff',
        paddingBottom: 10,
        paddingHorizontal: 15,
        zIndex: 1, // Ensure the header is above the WebView
        borderBottomWidth: 1,
        borderBottomColor: '#dddddd',
    },
    titleRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pagesText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#000000',
    },
    arrowRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 5,
    },
    arrowText: {
        fontSize: 20, // Slightly larger for visibility
        color: '#000000',
    },
    targetTitleText: {
        color: '#000000', // Match the color of other header texts
        fontWeight: '600', // Slightly bold to indicate interactivity
        textDecorationLine: 'underline', // Underline to indicate clickability
        fontSize: 16, // Same font size as pagesText
        textAlign: 'center',
        marginTop: 5, // Position slightly lower than the arrow
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 10,
    },
    counterText: {
        fontSize: 14,
        color: '#000000',
    },
    timerText: {
        fontSize: 14,
        color: '#000000',
    },
    webview: {
        flex: 1,
        marginTop: 160, // Adjust margin to prevent content from being hidden behind the header
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContainer: {
        flex: 1,
        backgroundColor: '#ffffff',
    },
    modalHeader: {
        position: 'absolute',
        top: 0, // Adjusted as per user change
        width: '100%',
        length: '35%',
        backgroundColor: '#ffffff',
        paddingBottom: 10,
        paddingHorizontal: 15,
        zIndex: 1, // Ensure the header is above the WebView
        borderBottomWidth: 1,
        borderBottomColor: '#dddddd',
    },
    closeButton: {
        fontSize: 18,
        color: '#3366CC',
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#000000',
    },
    modalWebview: {
        flex: 1,
    },
});
