import React from 'react';
import { Typography } from '@material-ui/core';
import { HeaderContainer } from './style';

const Header = () => {
  return (
    <HeaderContainer>
      <Typography variant="h1">Gabriel Rossi</Typography>
      <Typography variant="h4">curriculum vitae</Typography>
    </HeaderContainer>
  );
}

export default Header;
