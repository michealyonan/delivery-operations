import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { ActionButton, Label } from './ui';

export default function DatePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date;
  onChange: (value: Date) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <ActionButton onPress={() => setOpen(true)} tone="outline">
        {value.toLocaleDateString('ar-EG')}
      </ActionButton>
      {open ? (
        <>
          <DateTimePicker
            value={value}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, selectedDate) => {
              if (selectedDate) onChange(selectedDate);
              if (Platform.OS === 'android' || event.type === 'dismissed') setOpen(false);
            }}
          />
          {Platform.OS === 'ios' ? (
            <ActionButton onPress={() => setOpen(false)}>تم</ActionButton>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
