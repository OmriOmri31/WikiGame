// app/WinnerPage.js

import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import usePreventBack from './usePreventBack';

// Import Firebase Firestore functions
import { db } from '../firebaseConfig';
import {
    collection,
    getDocs,
    addDoc,
    query,
    orderBy,
    limit,
    Timestamp,
} from 'firebase/firestore';

/**
 * WinnerPage - Displays the time taken and pages visited to reach the target article.
 * If the player achieves a high score, prompts them to enter their name.
 * Regardless of the result, directs the user to the leaderboard.
 *
 * @component
 * @returns {JSX.Element} The WinnerPage component.
 */
const WinnerPage = () => {
    usePreventBack(); // Prevent back navigation

    const router = useRouter();
    const params = useLocalSearchParams();
    const { timeTaken, targetArticleTitle, targetArticleUrl, pageVisitCount } = params;

    // Fallbacks in case parameters are undefined
    const displayTime = parseFloat(timeTaken) || 0;
    const articleTitle = targetArticleTitle || 'המאמר המטרה';
    const articleUrl = targetArticleUrl || '';
    const visits = parseInt(pageVisitCount, 10) || 0;

    console.log(`WinnerPage loaded with timeTaken=${displayTime}`);

    // State variables for high score and player name
    const [isHighScore, setIsHighScore] = useState(false);
    const [playerName, setPlayerName] = useState('');

    useEffect(() => {
        checkIfHighScore();
    }, []);

    /**
     * Checks if the player's score qualifies for the top 10 high scores.
     */
    const checkIfHighScore = async () => {
        try {
            const scoresRef = collection(db, 'scores');
            const q = query(
                scoresRef,
                orderBy('pagesVisited', 'asc'),
                orderBy('timeTaken', 'asc'),
                orderBy('timestamp', 'asc'),
                limit(10)
            );
            const querySnapshot = await getDocs(q);

            const scores = querySnapshot.docs.map((doc) => doc.data());

            let qualifies = false;

            if (scores.length < 10) {
                qualifies = true;
            } else {
                const worstScore = scores[scores.length - 1];
                if (visits < worstScore.pagesVisited) {
                    qualifies = true;
                } else if (visits === worstScore.pagesVisited) {
                    if (displayTime < worstScore.timeTaken) {
                        qualifies = true;
                    }
                }
            }

            if (qualifies) {
                setIsHighScore(true);
            } else {
                // If not a high score, navigate to the leaderboard after a delay
                setTimeout(() => {
                    router.replace('/Leaderboard');
                }, 5000); // Adjust the delay as needed (in milliseconds)
            }
        } catch (error) {
            console.error('Error checking high scores:', error);
        }
    };

    /**
     * Submits the player's score to Firestore.
     */
    const submitScore = async () => {
        if (playerName.trim() === '') {
            Alert.alert('שגיאה', 'אנא הכנס שם תקין.');
            return;
        }

        try {
            await addDoc(collection(db, 'scores'), {
                name: playerName,
                pagesVisited: visits,
                timeTaken: displayTime,
                timestamp: Timestamp.now(),
            });
            Alert.alert('הצלחה', 'הציון שלך נשמר בטבלת השיאים!');
            // Navigate to the Leaderboard
            router.replace('/Leaderboard');
        } catch (error) {
            console.error('Error adding document: ', error);
            Alert.alert('שגיאה', 'התרחשה שגיאה בשמירת הציון.');
        }
    };

    return (
        <View style={styles.container}>
            {isHighScore ? (
                <>
                    <Text style={styles.congratsText}>הגעת לטבלת השיאים!</Text>
                    <Text style={styles.timeText}>
                        סיימת את המשחק ב-{displayTime} שניות.
                    </Text>
                    <Text style={styles.visitsText}>מספר הדפים שביקרת: {visits}</Text>
                    <Text style={styles.inputLabel}>הכנס את שמך:</Text>
                    <TextInput
                        style={styles.input}
                        value={playerName}
                        onChangeText={setPlayerName}
                        placeholder="השם שלך"
                    />
                    <TouchableOpacity style={styles.submitButton} onPress={submitScore}>
                        <Text style={styles.submitButtonText}>שלח</Text>
                    </TouchableOpacity>
                </>
            ) : (
                <>
                    <Text style={styles.congratsText}>כל הכבוד!</Text>
                    <Text style={styles.timeText}>
                        סיימת את המשחק ב-{displayTime} שניות.
                    </Text>
                    <Text style={styles.visitsText}>מספר הדפים שביקרת: {visits}</Text>
                    <Text style={styles.infoText}>
                        לצערנו, לא הצלחת להגיע לטבלת השיאים.
                    </Text>
                    <TouchableOpacity
                        style={styles.leaderboardButton}
                        onPress={() => router.replace('/Leaderboard')}
                    >
                        <Text style={styles.leaderboardButtonText}>צפה בטבלת השיאים</Text>
                    </TouchableOpacity>
                </>
            )}
        </View>
    );
};

export default WinnerPage;

/**
 * Styles for WinnerPage
 */
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
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
        marginBottom: 20,
    },
    inputLabel: {
        fontSize: 18,
        color: '#000000',
        marginTop: 20,
        textAlign: 'center',
    },
    input: {
        height: 40,
        borderColor: '#cccccc',
        borderWidth: 1,
        width: '80%',
        paddingHorizontal: 10,
        marginTop: 10,
        textAlign: 'center',
    },
    submitButton: {
        marginTop: 20,
        backgroundColor: '#3366CC',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 5,
    },
    submitButtonText: {
        fontSize: 16,
        color: '#ffffff',
    },
    infoText: {
        fontSize: 18,
        color: '#000000',
        textAlign: 'center',
        marginVertical: 20,
    },
    leaderboardButton: {
        backgroundColor: '#3366CC',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 5,
    },
    leaderboardButtonText: {
        fontSize: 16,
        color: '#ffffff',
    },
});
