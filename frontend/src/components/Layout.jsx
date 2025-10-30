/**
 * Layout components for the Pinpoint frontend.
 *
 * This file contains presentational components (TopBar, small helpers) so that
 * the main application logic in `App.jsx` remains focused on state and behavior.
 */
import React from 'react'
import { Box, Group, Title, Button, Container, UnstyledButton } from '@mantine/core'

/** TopBar
 * Props:
 * - onOpenAdmin: function to open admin/settings panel
 */
export function TopBar({ onOpenAdmin }){
  return (
    <Box sx={{ height: 68, display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
      <Container style={{ height: '100%' }}>
        <Group position="apart" align="center" style={{ height: '100%' }}>
          <Group spacing="md" align="center">
            <Title order={3} style={{ margin: 0 }}>Pinpoint</Title>
            <nav>
              <Group spacing={8}>
                <UnstyledButton aria-label="home" title="Home">Home</UnstyledButton>
                <UnstyledButton aria-label="map" title="Map">Map</UnstyledButton>
              </Group>
            </nav>
          </Group>

          <Group>
            <Button variant="subtle" color="gray" onClick={onOpenAdmin}>Admin</Button>
          </Group>
        </Group>
      </Container>
    </Box>
  )
}

export default { TopBar }
