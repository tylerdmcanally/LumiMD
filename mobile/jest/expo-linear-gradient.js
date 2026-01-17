const React = require('react');

const LinearGradient = React.forwardRef((props, ref) =>
  React.createElement('LinearGradient', { ...props, ref }, props.children)
);

module.exports = { LinearGradient };
