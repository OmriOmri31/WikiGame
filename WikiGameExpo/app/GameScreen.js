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
    TextInput,
    TouchableWithoutFeedback,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter, useLocalSearchParams } from 'expo-router';
import usePreventBack from './usePreventBack';

// Import Firebase Firestore functions
import { db } from '../firebaseConfig';
import {
    collection,
    addDoc,
    Timestamp,
    doc,
    getDoc,
} from 'firebase/firestore';

/**
 * GameScreen - Main game screen where the user navigates from a start article to a target article.
 *
 * The user is presented with a daily start article and must navigate to the daily target article.
 * The time taken to reach the target article is recorded and displayed upon completion.
 *
 * @component
 * @returns {JSX.Element} The GameScreen component.
 */
const GameScreen = () => {
    usePreventBack(); // Prevent back navigation

    const router = useRouter();
    const params = useLocalSearchParams();
    const { playerName } = params; // Get the player's name from params

    const [startArticleUrl, setStartArticleUrl] = useState(null);
    const [startArticleTitle, setStartArticleTitle] = useState('');
    const [targetArticleTitle, setTargetArticleTitle] = useState('');
    const [targetArticleUrl, setTargetArticleUrl] = useState('');
    const [gameStartTime, setGameStartTime] = useState(null);
    const [elapsedTime, setElapsedTime] = useState(0); // State for elapsed time
    const [pageVisitCount, setPageVisitCount] = useState(1); // State for page visit count
    const [isTargetModalVisible, setIsTargetModalVisible] = useState(false); // Modal visibility
    const [isSecretModalVisible, setIsSecretModalVisible] = useState(false); // Secret modal visibility
    const [secretInput, setSecretInput] = useState(''); // State for secret input
    const [tapCount, setTapCount] = useState(0); // Count of taps
    const [lastTapTime, setLastTapTime] = useState(null); // Time of the last tap
    const [showCongratsModal, setShowCongratsModal] = useState(false); // Show congrats modal

    const webViewRef = useRef(null);
    const intervalRef = useRef(null); // Ref to store the interval ID
    const previousUrlRef = useRef(''); // To track previous URL
    const isInitialLoadRef = useRef(true); // Flag to prevent initial load increment

    useEffect(() => {
        /**
         * Fetches the daily start and target articles from Firestore.
         */
        const fetchDailyArticles = async () => {
            try {
                const docRef = doc(db, 'daily', 'articles');
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const startTitle = data.startArticleTitle;
                    const targetTitle = data.targetArticleTitle;

                    // Set URLs and formatted titles
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
                    previousUrlRef.current = startUrl; // Initialize previous URL
                    isInitialLoadRef.current = true; // Set initial load flag
                } else {
                    Alert.alert('שגיאה', 'לא ניתן לטעון את המאמרים היומיים.');
                    console.error('No daily articles found in Firestore.');
                }
            } catch (error) {
                console.error('Error fetching daily articles:', error);
                Alert.alert('שגיאה', 'אירעה שגיאה בטעינת המאמרים.');
            }
        };

        fetchDailyArticles();

        return () => {
            // No cleanup needed here since interval is managed in a separate useEffect
        };
    }, []);

    useEffect(() => {
        if (gameStartTime) {
            // Start the timer interval
            intervalRef.current = setInterval(() => {
                const currentTime = Date.now();
                setElapsedTime(((currentTime - gameStartTime) / 1000).toFixed(2));
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
     * JavaScript code to disable all clickable elements in the modal WebView.
     * Ensures that links appear clickable but do nothing when clicked.
     */
    const modalInjectedJavaScript = `
        (function() {
            // Disable all click events
            document.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
            }, true); // Capture phase

            // Override window.location to prevent navigation
            Object.defineProperty(window, 'location', {
                set: function() {},
                get: function() {
                    return window.location;
                }
            });

            // Override window.open to prevent new windows
            window.open = function() {};

            // Override history methods to prevent navigation
            history.pushState = function() {};
            history.replaceState = function() {};

            // Prevent any changes to window.location via hash
            window.onhashchange = function() {};
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

                const timeTaken = parseFloat(elapsedTime);

                console.log(`User completed the game in ${timeTaken} seconds`);

                // Stop the timer
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }

                // Show the "כל הכבוד" message for 2 seconds
                setShowCongratsModal(true);

                // Store the player's score and then navigate to Leaderboard
                const storeScoreAndNavigate = async () => {
                    try {
                        await addDoc(collection(db, 'scores'), {
                            name: playerName,
                            pagesVisited: pageVisitCount,
                            timeTaken: timeTaken,
                            timestamp: Timestamp.now(),
                        });
                        console.log('Score saved successfully.');

                        // After 2 seconds, navigate to Leaderboard
                        setTimeout(() => {
                            // Navigate to Leaderboard with player's name
                            router.replace({
                                pathname: '/Leaderboard',
                                params: {
                                    playerName: playerName,
                                },
                            });
                        }, 2000);
                    } catch (error) {
                        console.error('Error adding document: ', error);
                        Alert.alert('שגיאה', 'התרחשה שגיאה בשמירת הציון.');
                    }
                };

                storeScoreAndNavigate();
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

    /**
     * Handles navigation attempts within the modal WebView to prevent navigation away from the target article.
     *
     * @param {object} request - The navigation request object.
     * @returns {boolean} - Whether to allow the navigation.
     */
    const handleModalShouldStartLoadWithRequest = (request) => {
        const url = request.url.toLowerCase();

        // Allow the initial target article URL and resource loading
        if (url === targetArticleUrl.toLowerCase()) {
            return true;
        }

        // Allow loading of resources (e.g., images, scripts, stylesheets)
        if (!request.isTopFrame) {
            return true;
        }

        // Block any other navigation attempts
        return false;
    };

    // Handle Android hardware back button to close the modal if it's open
    useEffect(() => {
        const backAction = () => {
            if (isTargetModalVisible) {
                setIsTargetModalVisible(false);
                return true; // Prevent default behavior
            }
            if (isSecretModalVisible) {
                setIsSecretModalVisible(false);
                return true; // Prevent default behavior
            }
            return false; // Allow default behavior
        };

        const backHandler = BackHandler.addEventListener(
            'hardwareBackPress',
            backAction
        );

        return () => backHandler.remove();
    }, [isTargetModalVisible, isSecretModalVisible]);

    /**
     * Handles taps on the unclickable header area to detect secret feature activation.
     */
    const handleHeaderTap = () => {
        const now = Date.now();

        if (lastTapTime && now - lastTapTime < 2000) {
            // Within 2 seconds
            setTapCount((prevCount) => prevCount + 1);
        } else {
            // Reset if more than 2 seconds have passed
            setTapCount(1);
        }

        setLastTapTime(now);

        if (tapCount + 1 >= 5) {
            // Open the secret modal
            setIsSecretModalVisible(true);
            // Reset tap count
            setTapCount(0);
            setLastTapTime(null);
        }
    };

    /**
     * Handles the secret input submission.
     */
    const handleSecretSubmit = () => {
        if (secretInput === 'Coys31') {
            // Navigate directly to the target article
            webViewRef.current?.injectJavaScript(`
                window.location.href = '${targetArticleUrl}';
                true;
            `);
            setIsSecretModalVisible(false);
        } else {
            // Close the modal and do nothing
            setIsSecretModalVisible(false);
        }
        setSecretInput(''); // Reset the input
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
            <TouchableWithoutFeedback onPress={handleHeaderTap}>
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
            </TouchableWithoutFeedback>

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

            {/* Modal for Target Article */}
            <Modal
                visible={isTargetModalVisible}
                animationType="slide"
                onRequestClose={() => setIsTargetModalVisible(false)}
            >
                <SafeAreaView style={styles.modalContainer}>
                    {/* Modal Header */}
                    <View style={styles.modalHeader}>
                        <View style={styles.closeButtonContainer}>
                            <TouchableOpacity onPress={() => setIsTargetModalVisible(false)}>
                                <Text style={styles.closeButton}>חזור למהלך המשחק</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.modalInfoRow}>
                            <Text style={styles.timerText}>זמן: {elapsedTime} שניות</Text>
                            <Text style={styles.counterText}>מספר הדפים: {pageVisitCount}</Text>
                        </View>
                    </View>

                    {/* Modal WebView */}
                    <WebView
                        source={{ uri: targetArticleUrl }}
                        style={styles.modalWebview}
                        injectedJavaScriptBeforeContentLoaded={
                            injectedJavaScriptBeforeContentLoaded
                        }
                        injectedJavaScript={modalInjectedJavaScript}
                        startInLoadingState
                        renderLoading={() => (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#3366CC" />
                            </View>
                        )}
                        onShouldStartLoadWithRequest={handleModalShouldStartLoadWithRequest}
                    />
                </SafeAreaView>
            </Modal>

            {/* Modal for Secret Feature */}
            <Modal
                visible={isSecretModalVisible}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setIsSecretModalVisible(false)}
            >
                <View style={styles.secretModalContainer}>
                    <View style={styles.secretModalContent}>
                        <Text style={styles.secretModalText}>הזן קוד סודי:</Text>
                        <TextInput
                            style={styles.secretInput}
                            value={secretInput}
                            onChangeText={setSecretInput}
                            placeholder="קוד סודי"
                            secureTextEntry
                        />
                        <TouchableOpacity
                            style={styles.secretButton}
                            onPress={handleSecretSubmit}
                        >
                            <Text style={styles.secretButtonText}>שלח</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Modal for Congrats Message */}
            <Modal
                visible={showCongratsModal}
                animationType="fade"
                transparent={true}
                onRequestClose={() => {}}
            >
                <View style={styles.congratsModalContainer}>
                    <View style={styles.congratsModalContent}>
                        <Text style={styles.congratsText}>כל הכבוד!</Text>
                        <Text style={styles.timeText}>
                            סיימת את המשחק ב-{elapsedTime} שניות.
                        </Text>
                        <Text style={styles.visitsText}>
                            מספר הדפים שביקרת: {pageVisitCount}
                        </Text>
                    </View>
                </View>
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
        top: 85, // Adjusted as per your changes
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
        top: 0,
        width: '100%',
        backgroundColor: '#ffffff',
        paddingVertical: 50,
        zIndex: 1,
        borderBottomWidth: 1,
        borderBottomColor: '#dddddd',
        flexDirection: 'column',
        alignItems: 'center',
    },
    closeButtonContainer: {
        width: '100%',
        alignItems: 'center',
    },
    closeButton: {
        fontSize: 18,
        color: '#3366CC',
    },
    modalInfoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        paddingHorizontal: 15,
        marginTop: 10,
    },
    modalWebview: {
        flex: 1,
        marginTop: 100, // Adjusted to accommodate the modal header height
    },
    // Styles for Secret Modal
    secretModalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    secretModalContent: {
        width: '80%',
        backgroundColor: '#ffffff',
        padding: 20,
        borderRadius: 10,
        alignItems: 'center',
    },
    secretModalText: {
        fontSize: 18,
        marginBottom: 15,
        color: '#000000',
    },
    secretInput: {
        height: 40,
        borderColor: '#cccccc',
        borderWidth: 1,
        width: '100%',
        paddingHorizontal: 10,
        marginBottom: 15,
        textAlign: 'center',
    },
    secretButton: {
        backgroundColor: '#3366CC',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 5,
    },
    secretButtonText: {
        color: '#ffffff',
        fontSize: 16,
    },
    // Styles for Congrats Modal
    congratsModalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    congratsModalContent: {
        width: '80%',
        backgroundColor: '#ffffff',
        padding: 20,
        borderRadius: 10,
        alignItems: 'center',
    },
    congratsText: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#000000',
        marginBottom: 20,
        textAlign: 'center',
    },
    timeText: {
        fontSize: 24,
        color: '#000000',
        textAlign: 'center',
        marginBottom: 10,
    },
    visitsText: {
        fontSize: 24,
        color: '#000000',
        textAlign: 'center',
    },
});
