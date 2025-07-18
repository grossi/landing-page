import React from 'react';
import { Badge } from '@chakra-ui/react';

interface SkillBadgeProps {
  skill: string;
  variant?: "subtle" | "outline" | "solid" | "surface" | "plain";
  colorPalette?: string;
  size?: "sm" | "md" | "lg" | "xs";
}

const SkillBadge: React.FC<SkillBadgeProps> = ({ 
  skill, 
  variant = "subtle", 
  colorPalette,
  size = "sm" 
}) => {
  return (
    <Badge 
      colorPalette={colorPalette} 
      size={size} 
      variant={variant}
    >
      {skill}
    </Badge>
  );
};

export default SkillBadge;