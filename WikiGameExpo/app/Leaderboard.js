// app/Leaderboard.js

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';

// Import Firebase Firestore functions
import { db } from '../firebaseConfig';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { useLocalSearchParams } from 'expo-router';

/**
 * Leaderboard - Displays the top 10 high scores and highlights the player's own score.
 * If the player's score is outside the top 10, shows their rank below the top 10.
 *
 * @component
 * @returns {JSX.Element} The Leaderboard component.
 */
const Leaderboard = () => {
    const [scores, setScores] = useState([]);
    const [playerScore, setPlayerScore] = useState(null);
    const [playerRank, setPlayerRank] = useState(null);

    const params = useLocalSearchParams();
    const { playerName } = params;
    const name = playerName || 'שחקן';

    useEffect(() => {
        const fetchScores = async () => {
            try {
                const scoresRef = collection(db, 'scores');
                const q = query(
                    scoresRef,
                    orderBy('pagesVisited', 'asc'),
                    orderBy('timeTaken', 'asc'),
                    orderBy('timestamp', 'asc')
                );
                const querySnapshot = await getDocs(q);

                const fetchedScores = querySnapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                }));

                // Sort the scores
                const sortedScores = fetchedScores.sort((a, b) => {
                    if (a.pagesVisited !== b.pagesVisited) {
                        return a.pagesVisited - b.pagesVisited;
                    } else if (a.timeTaken !== b.timeTaken) {
                        return a.timeTaken - b.timeTaken;
                    } else {
                        return a.timestamp.toMillis() - b.timestamp.toMillis();
                    }
                });

                // Find the player's latest score
                const playerScores = sortedScores.filter((score) => score.name === name);

                if (playerScores.length > 0) {
                    const latestPlayerScore = playerScores[playerScores.length - 1];

                    setPlayerScore(latestPlayerScore);

                    // Determine the player's rank
                    const rank =
                        sortedScores.findIndex(
                            (score) =>
                                score.name === latestPlayerScore.name &&
                                score.pagesVisited === latestPlayerScore.pagesVisited &&
                                score.timeTaken === latestPlayerScore.timeTaken &&
                                score.timestamp.toMillis() === latestPlayerScore.timestamp.toMillis()
                        ) + 1;

                    setPlayerRank(rank);
                } else {
                    // Player has no previous scores
                    setPlayerScore(null);
                    setPlayerRank(null);
                }

                // Get the top 10 scores
                const topScores = sortedScores.slice(0, 10);

                setScores(topScores);
            } catch (error) {
                console.error('Error fetching high scores:', error);
            }
        };

        fetchScores();
    }, []);

    const renderItem = ({ item, index }) => {
        const isPlayerScore = playerScore
            ? item.name === playerScore.name &&
            item.pagesVisited === playerScore.pagesVisited &&
            item.timeTaken === playerScore.timeTaken &&
            item.timestamp.toMillis() === playerScore.timestamp.toMillis()
            : false;

        return (
            <View style={[styles.item, isPlayerScore && styles.playerItem]}>
                <Text style={styles.rank}>{index + 1}.</Text>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.pages}>{item.pagesVisited}</Text>
                <Text style={styles.time}>{item.timeTaken} שניות</Text>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>טבלת השיאים</Text>
            <View style={styles.header}>
                <Text style={styles.headerText}>מקום</Text>
                <Text style={styles.headerText}>שם</Text>
                <Text style={styles.headerText}>מספר הצעדים לדף היעד</Text>
                <Text style={styles.headerText}>זמן</Text>
            </View>
            <FlatList
                data={scores}
                renderItem={renderItem}
                keyExtractor={(item, index) => index.toString()}
            />
            {playerRank > 10 && playerScore && (
                <>
                    <Text style={styles.dots}>.</Text>
                    <Text style={styles.dots}>.</Text>
                    <Text style={styles.dots}>.</Text>
                    <View style={[styles.item, styles.playerItem]}>
                        <Text style={styles.rank}>{playerRank}.</Text>
                        <Text style={styles.name}>{playerScore.name}</Text>
                        <Text style={styles.pages}>{playerScore.pagesVisited}</Text>
                        <Text style={styles.time}>{playerScore.timeTaken} שניות</Text>
                    </View>
                </>
            )}
        </View>
    );
};

export default Leaderboard;

/**
 * Styles for Leaderboard
 */
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff',
        paddingVertical: 40,
        paddingHorizontal: 20,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderBottomWidth: 2,
        borderBottomColor: '#cccccc',
        paddingBottom: 10,
        marginBottom: 10,
    },
    headerText: {
        fontSize: 14,
        fontWeight: 'bold',
        width: '25%',
        textAlign: 'center',
    },
    item: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eeeeee',
    },
    playerItem: {
        backgroundColor: '#FFFF99', // Light yellow
    },
    rank: {
        width: '15%',
        textAlign: 'center',
        fontSize: 14,
    },
    name: {
        width: '35%',
        textAlign: 'center',
        fontSize: 14,
    },
    pages: {
        width: '25%',
        textAlign: 'center',
        fontSize: 14,
    },
    time: {
        width: '25%',
        textAlign: 'center',
        fontSize: 14,
    },
    dots: {
        textAlign: 'center',
        fontSize: 24,
        color: '#888888',
    },
});
