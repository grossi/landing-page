import React from 'react';
import { BrowserRouter, Route, Switch } from 'react-router-dom';
import About from 'pages/About';
import Blog from 'pages/Blog';

function App() {
  return (
    <BrowserRouter>
      <Switch>
        <Route exact path="/" component={About} />
        <Route path="/blog" component={Blog} />
      </Switch>
    </BrowserRouter>
  );
}

export default App;
