import React, { useEffect, useState } from "react";
import { MainContainer, MainContent } from "./style";
import Markdown from 'components/Markdown';
import MainPage from "page.md";

const Main = () => {
  const [page, setPage] = useState('');
  useEffect(() => {
    fetch(MainPage)
      .then(data => data.text())
      .then(text => {
        setPage(text);
      });
  }, []);

  return (
    <MainContainer>
      <MainContent>
        <Markdown children={page} />
      </MainContent>
    </MainContainer>
  );
};

export default Main;
