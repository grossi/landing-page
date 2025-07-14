import React, { useState } from 'react';
import {
  Box,
  Heading,
  Text,
  VStack,
  HStack,
  Input,
  Textarea,
  Button,
  Icon,
  Grid,
  Link,
  Flex,
} from '@chakra-ui/react';
import { toaster } from 'components/ui/toaster';
import { motion } from 'framer-motion';
import {
  FaEnvelope,
  FaLinkedin,
  FaGithub,
  FaTwitter,
  FaPaperPlane,
  FaMapMarkerAlt,
  FaClock,
} from 'react-icons/fa';
import { useColorMode } from 'components/ui/color-mode';
import { Field } from 'components/ui/field';
import Header from '../organisms/Header';

const MotionBox = motion.create(Box);
const MotionButton = motion.create(Button);

interface FormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

const Contact: React.FC = () => {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { colorMode } = useColorMode();

  const bgColor = colorMode === 'light' ? 'gray.50' : 'gray.900';
  const cardBg = colorMode === 'light' ? 'white' : 'gray.800';
  const borderColor = colorMode === 'light' ? 'gray.200' : 'gray.700';
  const inputBg = colorMode === 'light' ? 'gray.50' : 'gray.700';
  const accentColor = colorMode === 'light' ? 'purple.500' : 'purple.400';

  const socialLinks = [
    { icon: FaLinkedin, href: '#', label: 'LinkedIn', color: '#0077B5' },
    { icon: FaGithub, href: '#', label: 'GitHub', color: colorMode === 'light' ? '#333' : '#fff' },
    { icon: FaTwitter, href: '#', label: 'Twitter', color: '#1DA1F2' },
    { icon: FaEnvelope, href: 'mailto:hello@example.com', label: 'Email', color: '#EA4335' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      toaster.error({
        title: 'Please fill in all fields',
        duration: 3000,
      });
      return;
    }

    setIsSubmitting(true);

    // Simulate form submission
    await new Promise((resolve) => setTimeout(resolve, 2000));

    toaster.success({
      title: 'Message sent!',
      description: "Thanks for reaching out. I'll get back to you soon.",
      duration: 5000,
    });

    setFormData({ name: '', email: '', subject: '', message: '' });
    setIsSubmitting(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <Box bg={bgColor} minH="100vh">
      <Header />
      <VStack gap={16} maxW="container.xl" mx="auto" px={4} py={12}>
        <VStack gap={4} textAlign="center">
          <Heading
            size="4xl"
            fontWeight="bold"
            bgGradient="linear(to-r, purple.400, blue.400)"
            bgClip="text"
          >
            Let's Connect
          </Heading>
          <Text fontSize="lg" color={{ base: 'gray.600', _dark: 'gray.400' }} maxW="2xl">
            Have a project in mind? Let's create something amazing together
          </Text>
        </VStack>

        <Grid
          templateColumns={{ base: '1fr', lg: '1fr 1fr' }}
          gap={12}
          w="full"
        >
          <MotionBox
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Box
              as="form"
              onSubmit={handleSubmit}
              bg={cardBg}
              p={8}
              borderRadius="xl"
              borderWidth={1}
              borderColor={borderColor}
              shadow="lg"
            >
              <VStack gap={6}>
                <Field label="Name" required>
                  <Input
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    onFocus={() => setFocusedField('name')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="John Doe"
                    bg={inputBg}
                    borderColor={focusedField === 'name' ? accentColor : borderColor}
                    _hover={{ borderColor: accentColor }}
                  />
                </Field>

                <Field label="Email" required>
                  <Input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="john@example.com"
                    bg={inputBg}
                    borderColor={focusedField === 'email' ? accentColor : borderColor}
                    _hover={{ borderColor: accentColor }}
                  />
                </Field>

                <Field label="Subject" required>
                  <Input
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    onFocus={() => setFocusedField('subject')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Project Inquiry"
                    bg={inputBg}
                    borderColor={focusedField === 'subject' ? accentColor : borderColor}
                    _hover={{ borderColor: accentColor }}
                  />
                </Field>

                <Field label="Message" required>
                  <Textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    onFocus={() => setFocusedField('message')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Tell me about your project..."
                    rows={5}
                    bg={inputBg}
                    borderColor={focusedField === 'message' ? accentColor : borderColor}
                    _hover={{ borderColor: accentColor }}
                  />
                </Field>

                <MotionButton
                  type="submit"
                  colorPalette="purple"
                  size="lg"
                  w="full"
                  loading={isSubmitting}
                  loadingText="Sending..."
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <FaPaperPlane />
                  Send Message
                </MotionButton>
              </VStack>
            </Box>
          </MotionBox>

          <VStack gap={8} align="stretch">
            <MotionBox
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <Box
                bg={cardBg}
                p={8}
                borderRadius="xl"
                borderWidth={1}
                borderColor={borderColor}
                shadow="lg"
              >
                <VStack align="start" gap={6}>
                  <Heading size="lg" color={{ base: 'gray.800', _dark: 'white' }}>Get in Touch</Heading>
                  <Text color={{ base: 'gray.600', _dark: 'gray.400' }}>
                    I'm always excited to work on new projects and collaborate with
                    amazing people. Feel free to reach out!
                  </Text>

                  <VStack align="start" gap={4} w="full">
                    <HStack gap={4}>
                      <Icon as={FaMapMarkerAlt} color={accentColor} boxSize={5} />
                      <Text color={{ base: 'gray.700', _dark: 'gray.300' }}>San Francisco, CA</Text>
                    </HStack>

                    <HStack gap={4}>
                      <Icon as={FaClock} color={accentColor} boxSize={5} />
                      <Text color={{ base: 'gray.700', _dark: 'gray.300' }}>Usually responds within 24 hours</Text>
                    </HStack>

                    <HStack gap={4}>
                      <Icon as={FaEnvelope} color={accentColor} boxSize={5} />
                      <Link href="mailto:hello@example.com" color={accentColor}>
                        hello@example.com
                      </Link>
                    </HStack>
                  </VStack>
                </VStack>
              </Box>
            </MotionBox>

            <MotionBox
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <Box
                bg={cardBg}
                p={8}
                borderRadius="xl"
                borderWidth={1}
                borderColor={borderColor}
                shadow="lg"
              >
                <VStack gap={6}>
                  <Heading size="lg" color={{ base: 'gray.800', _dark: 'white' }}>Connect on Social</Heading>
                  <Grid templateColumns="repeat(2, 1fr)" gap={4} w="full">
                    {socialLinks.map((social) => (
                      <MotionBox
                        key={social.label}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Link href={social.href} target="_blank" rel="noopener noreferrer">
                          <Flex
                            align="center"
                            justify="center"
                            p={4}
                            borderRadius="lg"
                            borderWidth={1}
                            borderColor={borderColor}
                            _hover={{
                              borderColor: social.color,
                              bg: colorMode === 'light' ? 'gray.50' : 'gray.700',
                            }}
                          >
                            <Icon
                              as={social.icon}
                              boxSize={6}
                              color={social.color}
                              mr={2}
                            />
                            <Text fontWeight="medium" color={{ base: 'gray.700', _dark: 'gray.300' }}>{social.label}</Text>
                          </Flex>
                        </Link>
                      </MotionBox>
                    ))}
                  </Grid>
                </VStack>
              </Box>
            </MotionBox>

            <MotionBox
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.8 }}
              bg={`linear-gradient(135deg, ${colorMode === 'light' ? '#667eea' : '#764ba2'}, ${colorMode === 'light' ? '#f093fb' : '#f5576c'})`}
              p={8}
              borderRadius="xl"
              shadow="lg"
              color="white"
              whileHover={{ scale: 1.02 }}
            >
              <VStack gap={4} align="start">
                <Heading size="md">Let's Build Something Great</Heading>
                <Text fontSize="sm">
                  Whether it's a web app, mobile solution, or something entirely new,
                  I'm here to help bring your vision to life.
                </Text>
              </VStack>
            </MotionBox>
          </VStack>
        </Grid>
      </VStack>
    </Box>
  );
};

export default Contact;