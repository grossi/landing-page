import React from 'react';
import { Box, Text } from '@chakra-ui/react';

interface FieldProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({ label, required, children }) => {
  return (
    <Box w="full">
      <Text fontSize="sm" fontWeight="medium" mb={2}>
        {label}
        {required && <Text as="span" color="red.500" ml={1}>*</Text>}
      </Text>
      {children}
    </Box>
  );
};