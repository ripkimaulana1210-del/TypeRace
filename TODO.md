## TODO: Fix Car Movement Instability

### Plan Steps:
- [x] Step 1: Improve surface raycasting in game3d.js (expand offsets, multi-hit blending)
- [x] Step 2: Reduce interpolation prediction lead and increase correction rate
- [x] Step 3: Add lateral position clamping from track centerline
- [x] Step 4: Test stability with fast typing (solo race)
- [x] Step 5: Further smooth car following centerline (no left-right sway), camera/frame transitions
- [x] Step 6: Final verification and complete

### Track Boundary Physics & Constraint:
- [x] Step 10: Off-road raycast detection (isTrackSurfaceMesh)
- [x] Step 11: Speed penalty, corrective force, checkpoint snap
- [x] Step 12: Test acceptance criteria
- [x] Step 13: Fix progress bug (remove local speed penalty, gentle lerp)
