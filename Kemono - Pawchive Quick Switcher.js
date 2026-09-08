// ==UserScript==
// @name         Kemono - Pawchive Quick Switcher
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Adds a floating bottom-left button to switch between Kemono.su/cr and Pawchive.st while preserving the URL path.
// @author       You
// @match        *://kemono.cr/*
// @match        *://www.kemono.cr/*
// @match        *://kemono.su/*
// @match        *://www.kemono.su/*
// @match        *://pawchive.st/*
// @match        *://www.pawchive.st/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Kemono%20-%20Pawchive%20Quick%20Switcher.js
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Kemono%20-%20Pawchive%20Quick%20Switcher.js
// ==/UserScript==

(function() {
    'use strict';

    const currentHost = window.location.hostname;
    
    // Determine target domain and icon based on current host
    const isKemono = currentHost.includes('kemono');
    
    const targetDomain = isKemono ? 'pawchive.st' : 'kemono.cr';
    
    // Favicons for the target websites
    const targetFavicon = isKemono 
        ? 'https://pawchive.st/favicon.ico' 
        : 'https://kemono.cr/favicon.ico';

    // Create the button element
    const button = document.createElement('a');
    button.id = 'domain-switcher-btn';
    
    // Construct target URL using current path, search parameters, and hash
    button.href = `https://${targetDomain}${window.location.pathname}${window.location.search}${window.location.hash}`;
    button.title = `Switch to ${targetDomain}`;

    // Styling for a square, fixed button in the bottom-left corner
    Object.assign(button.style, {
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        width: '45px',
        height: '45px',
        backgroundColor: isKemono ? '#282b30' : '#1e1e24', // Subtle background color match
        border: '2px solid #4e5058',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '999999',
        boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
        cursor: 'pointer',
        transition: 'transform 0.2s ease, border-color 0.2s ease'
    });

    // Create the icon inside the button
    const icon = document.createElement('img');
    icon.src = targetFavicon;
    icon.alt = targetDomain;
    
    Object.assign(icon.style, {
        width: '24px',
        height: '24px',
        pointerEvents: 'none' // Prevents icon from intercepting drag/clicks
    });

    // Fallback if favicon fails to load (shows first letter of target site)
    icon.onerror = () => {
        icon.remove();
        button.innerText = isKemono ? 'P' : 'K';
        button.style.color = '#fff';
        button.style.fontWeight = 'bold';
        button.style.fontSize = '20px';
        button.style.textDecoration = 'none';
    };

    button.appendChild(icon);

    // Hover effects
    button.addEventListener('mouseenter', () => {
        button.style.transform = 'scale(1.1)';
        button.style.borderColor = '#00afff';
    });
    
    button.addEventListener('mouseleave', () => {
        button.style.transform = 'scale(1)';
        button.style.borderColor = '#4e5058';
    });

    // Append button to the page once DOM is ready
    if (document.body) {
        document.body.appendChild(button);
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            document.body.appendChild(button);
        });
    }
})();
