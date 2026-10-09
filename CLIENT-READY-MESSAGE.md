Hi Anahita, the latest web updates are complete. Camera now has a capture, retake and preview flow, with Gallery kept separate. Report an Issue is available only from Profile.

Match actions now follow the profile’s current status, with confirmation for each action. Acceptance and accepted-match notifications open the new It’s a Match! screen; request notifications open the profile. Match cards open profiles without action buttons, and the old Pending screen is replaced. Introduction and the earlier approved changes are preserved.

I checked both roles in Chrome, Firefox and WebKit, completed regression checks, and pushed the changes to GitHub. The updated review build is verified: https://carezaar-web.vercel.app (existing review credentials).

Camera testing used simulated input; physical-device capture remains untested.
