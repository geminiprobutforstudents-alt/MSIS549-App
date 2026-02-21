import { WebView } from 'react-native-webview';
import { SafeAreaView, StyleSheet, Platform } from 'react-native';
import Constants from 'expo-constants';

const APP_URL = 'https://55d47594-8ff3-446d-82c3-43cc7efef759-00-1yshwvizspfc0.riker.replit.dev';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <WebView
        source={{ uri: APP_URL }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        geolocationEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? Constants.statusBarHeight : 0,
  },
  webview: {
    flex: 1,
  },
});
