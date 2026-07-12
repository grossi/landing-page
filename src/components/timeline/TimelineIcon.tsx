import React from 'react';
import { Circle, Icon } from '@chakra-ui/react';
import { motion, LegacyAnimationControls } from 'framer-motion';
import { FaBriefcase, FaGraduationCap, FaRocket, FaStar, FaGamepad, FaDesktop } from 'react-icons/fa';
import { timelineColors } from 'components/timeline/config';

const MotionCircle = motion(Circle);

const iconMap: { [key: string]: React.ElementType } = {
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
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  animate: LegacyAnimationControls;
}

const TimelineIcon: React.FC<TimelineIconProps> = ({
  icon,
  isHighlighted,
  onClick,
  onMouseEnter,
  onMouseLeave,
  animate
}) => {
  return (
    <MotionCircle
      size="60px"
      bg="black"
      borderWidth={1}
      borderColor={isHighlighted ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)'}
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
      <Icon as={iconMap[icon] ?? FaBriefcase} boxSize={6} color={timelineColors.highlightColor} />
    </MotionCircle>
  );
};

export default TimelineIcon;
