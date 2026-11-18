import { Text } from '@/components/ui/Text';
import {
  isNativeSpeechRecognitionAvailable,
  startSpeechRecognition,
  stopSpeechRecognition,
  supportsOnDeviceSpeechRecognition,
} from '@/services/voice/speech-recognition';
import { ParsedVoiceTransaction, parseVoiceTranscript, UserAccountRef } from '@/services/voice/voice-parser';
import { ThemeColors, typography, useTheme } from '@/theme';
import { getCurrencySymbol } from '@/utils/format';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface VoiceTransactionModalProps {
  visible: boolean;
  onDismiss: () => void;
  onApply: (parsed: ParsedVoiceTransaction) => void;
  onSave?: (parsed: ParsedVoiceTransaction) => void;
  accounts: UserAccountRef[];
}

export function VoiceTransactionModal({
  visible,
  onDismiss,
  onApply,
  onSave,
  accounts,
}: VoiceTransactionModalProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);

  const [inputPhrase, setInputPhrase] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedVoiceTransaction | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [speechStatus, setSpeechStatus] = useState<string | null>(null);
  const [isOnDevice, setIsOnDevice] = useState(false);

  const textInputRef = useRef<TextInput>(null);

  // Animations for voice recording pulse and audio waves
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveAnim1 = useRef(new Animated.Value(0.4)).current;
  const waveAnim2 = useRef(new Animated.Value(0.8)).current;
  const waveAnim3 = useRef(new Animated.Value(0.5)).current;
  const waveAnim4 = useRef(new Animated.Value(0.9)).current;
  const waveAnim5 = useRef(new Animated.Value(0.3)).current;

  // Keyboard height listener to prevent sheet from hiding behind keyboard
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Auto-start listening when modal opens
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (visible) {
      setIsOnDevice(supportsOnDeviceSpeechRecognition());
      timer = setTimeout(() => {
        handleStartListening();
      }, 350);
    } else {
      stopSpeechRecognition();
      setIsListening(false);
      setRecordingSeconds(0);
      setSpeechStatus(null);
    }
    return () => {
      if (timer) clearTimeout(timer);
      stopSpeechRecognition();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Voice recording pulse & audio waveform animation
  useEffect(() => {
    let timerId: ReturnType<typeof setInterval> | null = null;
    let pulseLoop: Animated.CompositeAnimation | null = null;
    let waveLoop: Animated.CompositeAnimation | null = null;

    if (isListening) {
      setRecordingSeconds(0);
      timerId = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();

      waveLoop = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(waveAnim1, { toValue: 1, duration: 350, useNativeDriver: false }),
            Animated.timing(waveAnim2, { toValue: 0.3, duration: 300, useNativeDriver: false }),
            Animated.timing(waveAnim3, { toValue: 0.95, duration: 400, useNativeDriver: false }),
            Animated.timing(waveAnim4, { toValue: 0.2, duration: 280, useNativeDriver: false }),
            Animated.timing(waveAnim5, { toValue: 0.85, duration: 380, useNativeDriver: false }),
          ]),
          Animated.parallel([
            Animated.timing(waveAnim1, { toValue: 0.3, duration: 350, useNativeDriver: false }),
            Animated.timing(waveAnim2, { toValue: 0.85, duration: 300, useNativeDriver: false }),
            Animated.timing(waveAnim3, { toValue: 0.4, duration: 400, useNativeDriver: false }),
            Animated.timing(waveAnim4, { toValue: 1, duration: 280, useNativeDriver: false }),
            Animated.timing(waveAnim5, { toValue: 0.25, duration: 380, useNativeDriver: false }),
          ]),
        ])
      );
      waveLoop.start();
    } else {
      pulseAnim.setValue(1);
    }

    return () => {
      if (timerId) clearInterval(timerId);
      if (pulseLoop) pulseLoop.stop();
      if (waveLoop) waveLoop.stop();
      pulseAnim.setValue(1);
    };
  }, [isListening, pulseAnim, waveAnim1, waveAnim2, waveAnim3, waveAnim4, waveAnim5]);

  const handleStartListening = async () => {
    setParsedResult(null);
    setSpeechStatus(null);

    const isAvailable = isNativeSpeechRecognitionAvailable();
    if (isAvailable) {
      setIsListening(true);
      const started = await startSpeechRecognition({
        onStart: () => {
          setIsListening(true);
          setSpeechStatus(null);
        },
        onEnd: () => {
          setIsListening(false);
        },
        onResult: (transcript, isFinal) => {
          setInputPhrase(transcript);
          if (isFinal && transcript.trim().length > 0) {
            handleProcessPhrase(transcript);
          }
        },
        onVolumeChange: (vol) => {
          if (vol > 0) {
            const normalized = Math.min(Math.max((vol + 2) / 12, 0.2), 1);
            Animated.timing(waveAnim3, {
              toValue: normalized,
              duration: 100,
              useNativeDriver: false,
            }).start();
          }
        },
        onError: (err) => {
          setIsListening(false);
          setSpeechStatus(err);
        },
      });

      if (!started) {
        setIsListening(false);
        requestAnimationFrame(() => {
          textInputRef.current?.focus();
        });
      }
    } else {
      // Fallback for pre-compiled builds: focus TextInput and show hint
      setIsListening(true);
      setSpeechStatus('Dictation ready — tap keyboard mic to speak or type');
      requestAnimationFrame(() => {
        textInputRef.current?.focus();
      });
    }
  };

  const handleStopListening = () => {
    stopSpeechRecognition();
    setIsListening(false);
    if (inputPhrase.trim().length > 0) {
      handleProcessPhrase(inputPhrase);
    }
  };

  const handleProcessPhrase = async (phraseToUse?: string) => {
    const text = (phraseToUse ?? inputPhrase).trim();
    if (!text || isProcessing) return;

    stopSpeechRecognition();
    setIsListening(false);
    setIsProcessing(true);
    Keyboard.dismiss();

    try {
      const result = await parseVoiceTranscript(text, accounts);
      setParsedResult(result);
    } catch {
      // Error handled gracefully
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApply = () => {
    if (parsedResult) {
      onApply(parsedResult);
      handleClose();
    }
  };

  const handleSave = () => {
    if (parsedResult) {
      if (onSave) {
        onSave(parsedResult);
      } else {
        onApply(parsedResult);
      }
      handleClose();
    }
  };

  const handleClose = () => {
    stopSpeechRecognition();
    setInputPhrase('');
    setIsListening(false);
    setParsedResult(null);
    setIsProcessing(false);
    setRecordingSeconds(0);
    setSpeechStatus(null);
    Keyboard.dismiss();
    onDismiss();
  };

  const SAMPLE_PHRASES = [
    'Paid 350 for lunch at Subway with HDFC',
    'Chai and samosa 60 rupees cash',
    'Petrol 1500 using SBI card',
    'Got 45000 salary credited to ICICI',
  ];

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

        <View
          style={[
            styles.sheetContainer,
            {
              paddingBottom:
                keyboardHeight > 0
                  ? keyboardHeight + 16
                  : Platform.OS === 'ios'
                  ? 36
                  : 24,
            },
          ]}
        >
          <View style={styles.handleBar} />

          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Header */}
            <View style={styles.headerRow}>
              <View style={styles.headerTitleRow}>
                <View style={styles.micIconCircle}>
                  <MaterialIcons name="mic" size={20} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.title}>Voice Transaction</Text>
                  <Text style={styles.subtitle}>Speak or type in natural language</Text>
                </View>
              </View>
              <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={22} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            {/* Interactive Voice Recorder Section */}
            {!parsedResult && (
              <View style={styles.recorderCard}>
                {isListening ? (
                  <View style={styles.listeningContainer}>
                    {/* Animated Outer Pulse Ring */}
                    <View style={styles.micWrapper}>
                      <Animated.View
                        style={[
                          styles.pulseRing,
                          {
                            transform: [{ scale: pulseAnim }],
                          },
                        ]}
                      />
                      <TouchableOpacity
                        style={styles.micActiveBtn}
                        onPress={handleStopListening}
                        activeOpacity={0.8}
                      >
                        <MaterialIcons name="stop" size={32} color="#fff" />
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.recordingTimerText}>{formatTimer(recordingSeconds)}</Text>
                    <Text style={styles.listeningPrompt}>
                      {isOnDevice ? 'Listening on-device (Offline)...' : 'Listening to your voice...'}
                    </Text>

                    {/* Animated Audio Waveform */}
                    <View style={styles.waveformContainer}>
                      <Animated.View
                        style={[
                          styles.waveBar,
                          {
                            height: waveAnim1.interpolate({
                              inputRange: [0, 1],
                              outputRange: [6, 28],
                            }),
                          },
                        ]}
                      />
                      <Animated.View
                        style={[
                          styles.waveBar,
                          {
                            height: waveAnim2.interpolate({
                              inputRange: [0, 1],
                              outputRange: [6, 28],
                            }),
                          },
                        ]}
                      />
                      <Animated.View
                        style={[
                          styles.waveBar,
                          {
                            height: waveAnim3.interpolate({
                              inputRange: [0, 1],
                              outputRange: [6, 28],
                            }),
                          },
                        ]}
                      />
                      <Animated.View
                        style={[
                          styles.waveBar,
                          {
                            height: waveAnim4.interpolate({
                              inputRange: [0, 1],
                              outputRange: [6, 28],
                            }),
                          },
                        ]}
                      />
                      <Animated.View
                        style={[
                          styles.waveBar,
                          {
                            height: waveAnim5.interpolate({
                              inputRange: [0, 1],
                              outputRange: [6, 28],
                            }),
                          },
                        ]}
                      />
                    </View>

                    <TouchableOpacity style={styles.stopActionBtn} onPress={handleStopListening}>
                      <MaterialIcons name="check" size={18} color="#fff" />
                      <Text style={styles.stopActionBtnText}>Done Speaking - Analyze</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.idleMicContainer}>
                    <TouchableOpacity
                      style={styles.micIdleBtn}
                      onPress={handleStartListening}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="mic" size={36} color={colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.tapToSpeakText}>Tap to Record Voice</Text>
                    <Text style={styles.dictateHintText}>
                      {isOnDevice
                        ? 'Fast on-device speech recognition active'
                        : 'Speak your expense naturally or tap keyboard mic'}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Speech Status Banner */}
            {speechStatus ? (
              <View style={styles.speechStatusBanner}>
                <MaterialIcons name="info-outline" size={16} color={colors.primary} />
                <Text style={styles.speechStatusText}>
                  {speechStatus.toLowerCase().includes('not yet downloaded')
                    ? 'Offline language pack not downloaded in Android settings. Tap to retry or use standard voice input.'
                    : speechStatus}
                </Text>
              </View>
            ) : null}

            {/* Live Transcript / Input Box */}
            <View style={styles.inputContainer}>
              <MaterialIcons name="record-voice-over" size={18} color={colors.onSurfaceVariant} style={{ marginRight: 6 }} />
              <TextInput
                ref={textInputRef}
                style={styles.textInput}
                placeholder="Spoken words appear here or type..."
                placeholderTextColor={colors.outline}
                value={inputPhrase}
                onChangeText={(text) => {
                  setInputPhrase(text);
                  if (parsedResult) setParsedResult(null);
                }}
                multiline
                numberOfLines={2}
                returnKeyType="done"
                onSubmitEditing={() => handleProcessPhrase()}
              />
              {inputPhrase.trim().length > 0 && (
                <TouchableOpacity
                  style={styles.parseBtn}
                  onPress={() => handleProcessPhrase()}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialIcons name="arrow-forward" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Quick Example Chips */}
            {!parsedResult && (
              <View style={styles.samplesContainer}>
                <Text style={styles.samplesTitle}>Try saying or tapping:</Text>
                <View style={styles.chipsRow}>
                  {SAMPLE_PHRASES.map((phrase, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.chip}
                      onPress={() => {
                        stopSpeechRecognition();
                        setInputPhrase(phrase);
                        handleProcessPhrase(phrase);
                      }}
                    >
                      <Text style={styles.chipText}>{phrase}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Parsed Result Card */}
            {parsedResult && (
              <View style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultHeaderTitle}>Extracted Details</Text>
                  <View
                    style={[
                      styles.sourceBadge,
                      {
                        backgroundColor:
                          parsedResult.source === 'local'
                            ? colors.surfaceContainerHigh
                            : colors.primaryContainer,
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={parsedResult.source === 'local' ? 'offline-bolt' : 'cloud-done'}
                      size={12}
                      color={
                        parsedResult.source === 'local'
                          ? colors.onSurfaceVariant
                          : colors.onPrimaryContainer
                      }
                    />
                    <Text
                      style={[
                        styles.sourceBadgeText,
                        {
                          color:
                            parsedResult.source === 'local'
                              ? colors.onSurfaceVariant
                              : colors.onPrimaryContainer,
                        },
                      ]}
                    >
                      {parsedResult.source === 'local' ? 'On-Device (Offline)' : 'Privacy AI'}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailsGrid}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Merchant</Text>
                    <Text style={styles.detailValue} numberOfLines={1}>
                      {parsedResult.merchant || 'General'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Amount</Text>
                    <Text style={[styles.detailValue, styles.amountHighlight]}>
                      {getCurrencySymbol()}
                      {parsedResult.amount.toFixed(2)}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Category</Text>
                    <Text style={styles.detailValue}>{parsedResult.category}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Type</Text>
                    <Text style={styles.detailValue}>
                      {parsedResult.type.charAt(0).toUpperCase() + parsedResult.type.slice(1)}
                    </Text>
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.retryBtn}
                    onPress={() => {
                      setParsedResult(null);
                      setInputPhrase('');
                      handleStartListening();
                    }}
                  >
                    <Text style={styles.retryBtnText}>Clear</Text>
                  </TouchableOpacity>

                  {onSave ? (
                    <>
                      <TouchableOpacity style={styles.secondaryActionBtn} onPress={handleApply}>
                        <MaterialIcons name="edit" size={16} color={colors.onSurface} />
                        <Text style={styles.secondaryActionBtnText}>Review</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.applyBtn} onPress={handleSave}>
                        <MaterialIcons name="check" size={18} color="#fff" />
                        <Text style={styles.applyBtnText}>Save</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity style={styles.applyBtn} onPress={handleApply}>
                      <MaterialIcons name="check" size={18} color="#fff" />
                      <Text style={styles.applyBtnText}>Fill Transaction</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
    },
    backdrop: {
      flex: 1,
    },
    sheetContainer: {
      backgroundColor: colors.surfaceContainerLowest,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 12,
      maxHeight: '90%',
      borderTopWidth: 1,
      borderTopColor: colors.outlineVariant,
    },
    handleBar: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.outlineVariant,
      alignSelf: 'center',
      marginBottom: 12,
    },
    scrollContent: {
      paddingBottom: 16,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    micIconCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      ...typography.headlineSm,
      color: colors.onSurface,
      fontWeight: '700',
      lineHeight: 28,
    },
    subtitle: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 2,
    },
    recorderCard: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingVertical: 18,
      paddingHorizontal: 16,
      alignItems: 'center',
      marginBottom: 14,
    },
    idleMicContainer: {
      alignItems: 'center',
    },
    micIdleBtn: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    tapToSpeakText: {
      ...typography.bodyLg,
      color: colors.onSurface,
      fontWeight: '700',
      marginBottom: 2,
    },
    dictateHintText: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      fontSize: 12,
      textAlign: 'center',
    },
    listeningContainer: {
      alignItems: 'center',
      width: '100%',
    },
    micWrapper: {
      width: 80,
      height: 80,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    pulseRing: {
      position: 'absolute',
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.error,
      opacity: 0.25,
    },
    micActiveBtn: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.error,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
    },
    recordingTimerText: {
      ...typography.headlineSm,
      color: colors.error,
      fontWeight: '700',
      marginBottom: 2,
    },
    listeningPrompt: {
      ...typography.bodyMd,
      color: colors.onSurface,
      fontWeight: '600',
      marginBottom: 10,
    },
    waveformContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 32,
      marginBottom: 14,
    },
    waveBar: {
      width: 4,
      borderRadius: 2,
      backgroundColor: colors.primary,
    },
    stopActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primary,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 20,
    },
    stopActionBtnText: {
      ...typography.labelMd,
      color: '#fff',
      fontWeight: '700',
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginBottom: 14,
    },
    textInput: {
      flex: 1,
      ...typography.bodyMd,
      color: colors.onSurface,
      minHeight: 40,
      textAlignVertical: 'center',
    },
    parseBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
    },
    samplesContainer: {
      marginBottom: 8,
    },
    samplesTitle: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      fontSize: 11,
      marginBottom: 8,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      backgroundColor: colors.surfaceContainerHigh,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.outlineVariant,
    },
    chipText: {
      ...typography.labelMd,
      fontSize: 12,
      color: colors.onSurface,
    },
    resultCard: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      marginTop: 4,
    },
    resultHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.outlineVariant,
    },
    resultHeaderTitle: {
      ...typography.bodyLg,
      color: colors.onSurface,
      fontWeight: '700',
    },
    sourceBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    sourceBadgeText: {
      ...typography.labelMd,
      fontSize: 10,
      fontWeight: '600',
    },
    detailsGrid: {
      gap: 8,
      marginBottom: 16,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    detailLabel: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      fontSize: 13,
    },
    detailValue: {
      ...typography.bodyMd,
      color: colors.onSurface,
      fontWeight: '600',
      fontSize: 13,
      maxWidth: '60%',
    },
    amountHighlight: {
      color: colors.primary,
      fontWeight: '700',
      fontSize: 15,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    retryBtn: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    retryBtnText: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      fontWeight: '600',
    },
    secondaryActionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerHigh,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    secondaryActionBtnText: {
      ...typography.labelMd,
      color: colors.onSurface,
      fontWeight: '600',
      fontSize: 13,
      lineHeight: 18,
    },
    applyBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    applyBtnText: {
      ...typography.labelMd,
      color: '#fff',
      fontWeight: '700',
      fontSize: 13,
      lineHeight: 18,
    },
    speechStatusBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surfaceContainerHigh,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      marginBottom: 12,
    },
    speechStatusText: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      flex: 1,
    },
  });
  return styles;
};
