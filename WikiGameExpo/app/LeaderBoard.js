// app/Leaderboard.js

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';

// Import Firebase Firestore functions
import { db } from '../firebaseConfig';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

/**
 * Leaderboard - Displays the top 10 high scores.
 *
 * @component
 * @returns {JSX.Element} The Leaderboard component.
 */
const Leaderboard = () => {
    const [scores, setScores] = useState([]);

    useEffect(() => {
        const fetchScores = async () => {
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

                const fetchedScores = querySnapshot.docs.map((doc) => doc.data());
                setScores(fetchedScores);
            } catch (error) {
                console.error('Error fetching high scores:', error);
            }
        };

        fetchScores();
    }, []);

    const renderItem = ({ item, index }) => (
        <View style={styles.item}>
            <Text style={styles.rank}>{index + 1}.</Text>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.pages}>{item.pagesVisited}</Text>
            <Text style={styles.time}>{item.timeTaken} שניות</Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <Text style={styles.title}>טבלת השיאים</Text>
            <View style={styles.header}>
                <Text style={styles.headerText}>מקום</Text>
                <Text style={styles.headerText}>שם</Text>
                <Text style={styles.headerText}>דפים</Text>
                <Text style={styles.headerText}>זמן</Text>
            </View>
            <FlatList
                data={scores}
                renderItem={renderItem}
                keyExtractor={(item, index) => index.toString()}
            />
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
        fontSize: 18,
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
    rank: {
        width: '10%',
        textAlign: 'center',
        fontSize: 16,
    },
    name: {
        width: '40%',
        textAlign: 'center',
        fontSize: 16,
    },
    pages: {
        width: '25%',
        textAlign: 'center',
        fontSize: 16,
    },
    time: {
        width: '25%',
        textAlign: 'center',
        fontSize: 16,
    },
});
