import './style.css'

// Navbar scroll effect
const navbar = document.getElementById('navbar');

window.addEventListener('scroll', () => {
  if (window.scrollY > 10) {
    navbar?.classList.add('shadow-sm');
  } else {
    navbar?.classList.remove('shadow-sm');
  }
});

console.log('LumiMD Landing Page Loaded');
