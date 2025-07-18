import React from 'react';
import { Circle, Icon } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { FaBriefcase, FaGraduationCap, FaRocket, FaStar, FaGamepad, FaDesktop } from 'react-icons/fa';

const MotionCircle = motion(Circle);

const iconMap: { [key: string]: any } = {
  FaBriefcase,
  FaGraduationCap,
  FaRocket,
  FaStar,
  FaGamepad,
  FaDesktop,
};

interface TimelineIconProps {
  icon: string;
  isHighlighted: boolean;
  cardBg: string;
  lineColor: string;
  highlightColor: string;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  animate: any;
}

const TimelineIcon: React.FC<TimelineIconProps> = ({
  icon,
  isHighlighted,
  cardBg,
  lineColor,
  highlightColor,
  onClick,
  onMouseEnter,
  onMouseLeave,
  animate
}) => {
  return (
    <MotionCircle
      size="60px"
      bg={cardBg}
      borderWidth={3}
      borderColor={isHighlighted ? highlightColor : lineColor}
      zIndex={50}
      whileHover={{ scale: 1.2 }}
      transition={{ duration: 0.2 }}
      cursor="pointer"
      onClick={onClick}
      animate={animate}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      position="relative"
    >
      <Icon as={iconMap[icon]} boxSize={6} color={highlightColor} />
    </MotionCircle>
  );
};

export default TimelineIcon;