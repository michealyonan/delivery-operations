import { Alert as NativeAlert, Platform } from 'react-native';

type AlertButton = {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      NativeAlert.alert(title, message, buttons);
      return;
    }

    const content = [title, message].filter(Boolean).join('\n\n');
    const confirmButton = buttons?.find((button) => button.style !== 'cancel');
    if (!confirmButton) {
      window.alert(content);
      return;
    }

    if (window.confirm(content)) confirmButton.onPress?.();
  },
};
