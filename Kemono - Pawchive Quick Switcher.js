// ==UserScript==
// @name         Kemono - Pawchive Quick Switcher
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Adds a persistent floating button to switch between Kemono and Pawchive dynamically updating the current path.
// @author       You
// @match        *://kemono.cr/*
// @match        *://www.kemono.cr/*
// @match        *://kemono.su/*
// @match        *://www.kemono.su/*
// @match        *://pawchive.pw/*
// @match        *://www.pawchive.pw/*
// @updateURL    https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Kemono%20-%20Pawchive%20Quick%20Switcher.js
// @downloadURL  https://raw.githubusercontent.com/theVersu/hmm/refs/heads/main/Kemono%20-%20Pawchive%20Quick%20Switcher.js
// @grant        none
// ==UserScript==

(function() {
    'use strict';

    // Embedded Base64 Icons
    const ICONS_B64 = {
        kemono: "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAA4VBMVEUAAAD8///////////////////////+/v7////+/v7////////////////////////////////////////////////////////////////////////////////////////+/v7////////////+/v7+/v7+/v7+/v7+/v7////////+/v7////+/v7+/v7////////////////////////////////////+/v7+/v7////////+/v7+/v7+/v4B//7+/v7+/v7////+/v7+/v7////+Af/////+//7+/v7+/P4l5DYqAAAASHRSTlMAAgQHCg8SFhkbHiEkKCouMjY6PUJGSk9SVVpfZGpscHZ6foKEiYyPk5aanqOnq6+0uL3Aw8fKztLa3uLl5+np6+7z9vj7/P7TBRA8AAADyklEQVR42p3T6XaiShQF4A04dTROUeMUjSYa4xDnAaN9EeHau9//gRpqKaAhDvnW4gdFFWevU1VI4ueS6wFgvir4oUedVUDn4ochqiYZAzqk+aLA168cLOkIfEgtkksAGZLfhegyBUTZxVfBAS3vsCxJvxBhAE1+AHUOAEgn2ea05WF5oTBPwKum5+1PZhwqx0Bw1oZHckWbEYQlRv4VbzUZrgKNMipkJ0VOrfUcwpXTKUwgTMilScssDoe04K5WIo0+qVrrWThuP9UNWYNQJs36UoR4lj0RyCmF9YzUFOzJLVG8TTIJIWiQWrJH2zTuieDVcto/pKWfNUlNcnaLXIZL+nGIAr2SR+1vh1TS3d6cqB2Iz2ib3kMIb+jSYofTT8sLOrSUsCevaBnKyhttWztEqrul125UUMTpJ80nFMVQBAdN2roychrJ35xUZtzqPLFu1HYkt4+4F9/mcCR4+ENkRNafdKrVULhp0MfmAYE5bQ24ZhT6AUg1s4toRoLlrmvy1GcCaFPIwFWhIE59etlQnGgDHlvdAYE1bboCV9ig8Gwv2ngv58OEXmYewJNTzNWnkAYiS5JGXcZBXqWHngLitFXgKJWkPIXooUGc3eNALq/o0qJQaIvhQFlzktLElQzIA+5tq5I743lDhxqSDZJLCY6cSXNDm9yia3wHR9DZ0+3iWa4+po0iPBrce6eXXpbg+NUedWrFhzCEDLPYk+1nQn+DCPzVmcLe9HPUqpQN+tOK8NVlXFS/T+CD5/VC8DFnPFlqLgwugcyCZzXxhXSn0qBtUwEgVzY8Yy3jSLI2WJGC+R4GIMWfhjwnC6+wxoNJEpb+b17Qg4e3Z6teJSGBFxlBuAo8piFVrHenBs8pwxHSeEyHRX7lWWM4enQZzfJDRAIQGfO8XQx7eVL4S9skAltm7Qz6EMOTl3IuHgRCJw1fZwEoGv+fNYpbXrLTF6qniGnYY3UJeMyHgDce+8NLzHT2bW6qMoSITq5U3uQDQOjQnRY5iozI9YpXmQ1JMwnHnbl7kzEiqwVeZSS97jiEQ+kUAcy4DmDIiwbkCMjpjOGYyioQNXjBQl5QBXBfxIm5FQCo84IcMlThR/4Fi6LSzx/vuR51cUaWZyVx0QfP6OGyiM5vGVFcocpvveEa8pzf0EO4Stqkv2dcqU1fnwquFP6Pfkq4Wpk+ZhKuJo35VQY3SJg8NcBNmjxhJnCT4CePdXCjPI/od7jVkFy8Psai0WRlTDZws9i2j4OBFsDt6sYhdsSs4AcU9R0QXlQFP5HdR5DW+W/n/APmACehd2Z/OAAAAABJRU5ErkJggg==",
        pawchive: "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"
    };

    const currentHost = window.location.hostname;
    const isKemono = currentHost.includes('kemono');
    const iconData = isKemono ? ICONS_B64.pawchive : ICONS_B64.kemono;

    // Create the button element
    const button = document.createElement('a');
    button.id = 'domain-switcher-btn';
    button.title = 'Switch domain';

    // Styling
    Object.assign(button.style, {
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        width: '45px',
        height: '45px',
        backgroundColor: isKemono ? '#282b30' : '#1e1e24',
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

    // Create icon element
    const icon = document.createElement('img');
    icon.src = `data:image/png;base64,${iconData}`;
    icon.alt = 'Switch Domain';
    Object.assign(icon.style, {
        width: '24px',
        height: '24px',
        pointerEvents: 'none'
    });
    button.appendChild(icon);

    // Hover visual effects
    button.addEventListener('mouseenter', () => {
        button.style.transform = 'scale(1.1)';
        button.style.borderColor = '#00afff';
    });
    button.addEventListener('mouseleave', () => {
        button.style.transform = 'scale(1)';
        button.style.borderColor = '#4e5058';
    });

    // Dynamic Navigation Logic
    // Evaluates current live URL right at the moment of click
    button.addEventListener('click', (e) => {
        e.preventDefault();
        const currentUrl = window.location.href;
        let targetUrl = currentUrl;

        if (currentUrl.includes('kemono.cr')) {
            targetUrl = currentUrl.replace('kemono.cr', 'pawchive.pw');
        } else if (currentUrl.includes('kemono.su')) {
            targetUrl = currentUrl.replace('kemono.su', 'pawchive.pw');
        } else if (currentUrl.includes('pawchive.pw')) {
            targetUrl = currentUrl.replace('pawchive.pw', 'kemono.cr');
        }

        window.location.href = targetUrl;
    });

    // Ensure persistent presence across client-side SPA route/tab changes
    function mountButton() {
        if (document.body && !document.getElementById('domain-switcher-btn')) {
            document.body.appendChild(button);
        }
    }

    // Initial mount
    mountButton();

    // Continuous Observer to restore button if single-page scripts clear the DOM
    const observer = new MutationObserver(() => {
        mountButton();
    });

    observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true
    });
})();
