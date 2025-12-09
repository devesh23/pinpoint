import React from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"

export default function RightPanel({ open = true, onClose = () => { }, anchors = [], employees = [], logs = [], debugInfo = null, frameCount = 0, showDebug = false, setShowDebug = () => { }, onMockAnchors = () => { }, anchorMode = false, setAnchorMode = () => { }, showMiniMap = false, setShowMiniMap = () => { } }) {
  return (
    <Sheet open={open} onOpenChange={(val) => !val && onClose()} modal={false}>
      <SheetContent side="right" className="w-[380px] sm:w-[380px] p-0 flex flex-col gap-0" overlay={false}>
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center justify-between">
            <span>Panel</span>
            <Badge variant="secondary" className="bg-teal-500/10 text-teal-500 hover:bg-teal-500/20">frames {frameCount}</Badge>
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="devices" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 pt-2 border-b">
            <TabsList className="w-full grid grid-cols-5 h-9">
              <TabsTrigger value="devices" className="text-xs px-1">Devices</TabsTrigger>
              <TabsTrigger value="anchors" className="text-xs px-1">Anchors</TabsTrigger>
              <TabsTrigger value="stream" className="text-xs px-1">Stream</TabsTrigger>
              <TabsTrigger value="debug" className="text-xs px-1">Debug</TabsTrigger>
              <TabsTrigger value="controls" className="text-xs px-1">Controls</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="devices" className="flex-1 overflow-hidden p-0 m-0 border-0 data-[state=active]:flex data-[state=active]:flex-col">
            <ScrollArea className="flex-1">
              <div className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8">Name</TableHead>
                      <TableHead className="h-8">ID</TableHead>
                      <TableHead className="h-8">X</TableHead>
                      <TableHead className="h-8">Y</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map(e => (
                      <TableRow key={e.id} className="h-8">
                        <TableCell className="py-2">{e.label || e.id}</TableCell>
                        <TableCell className="py-2"><code className="bg-muted px-1 py-0.5 rounded text-[10px]">{e.id}</code></TableCell>
                        <TableCell className="py-2">{e.x?.toFixed?.(2)}</TableCell>
                        <TableCell className="py-2">{e.y?.toFixed?.(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="anchors" className="flex-1 overflow-hidden p-0 m-0 border-0 data-[state=active]:flex data-[state=active]:flex-col">
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">Anchors</span>
                  <div className="flex items-center space-x-2">
                    <Switch id="anchor-mode" checked={anchorMode} onCheckedChange={setAnchorMode} />
                    <Label htmlFor="anchor-mode" className="text-xs">{anchorMode ? 'Placing…' : 'Place anchors'}</Label>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8">Name</TableHead>
                      <TableHead className="h-8">ID</TableHead>
                      <TableHead className="h-8">x</TableHead>
                      <TableHead className="h-8">y</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {anchors.map(a => (
                      <TableRow key={a.beaconId} className="h-8">
                        <TableCell className="py-2">{a.name || a.beaconId}</TableCell>
                        <TableCell className="py-2"><code className="bg-muted px-1 py-0.5 rounded text-[10px]">{a.beaconId}</code></TableCell>
                        <TableCell className="py-2">{a.x.toFixed(3)}</TableCell>
                        <TableCell className="py-2">{a.y.toFixed(3)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="text-[10px] text-muted-foreground">Tip: When “Place anchors” is on, click on the plan to add anchors, or drag existing ones.</p>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="stream" className="flex-1 overflow-hidden p-0 m-0 border-0 data-[state=active]:flex data-[state=active]:flex-col">
            <ScrollArea className="flex-1">
              <div className="p-4">
                <p className="text-xs text-muted-foreground mb-2">Latest frame</p>
                <pre className="text-[10px] font-mono whitespace-pre-wrap bg-muted p-2 rounded">{JSON.stringify(debugInfo, null, 2)}</pre>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="debug" className="flex-1 overflow-hidden p-0 m-0 border-0 data-[state=active]:flex data-[state=active]:flex-col">
            <ScrollArea className="flex-1">
              <div className="p-4">
                <p className="text-xs text-muted-foreground mb-2">Logs</p>
                <pre className="text-[10px] font-mono whitespace-pre-wrap bg-muted p-2 rounded">{(logs || []).join('\n')}</pre>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="controls" className="flex-1 overflow-hidden p-0 m-0 border-0">
            <div className="p-4 space-y-4">
              <div className="flex items-center space-x-2">
                <Switch id="show-debug" checked={showDebug} onCheckedChange={setShowDebug} />
                <Label htmlFor="show-debug">Show floating debug overlay</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch id="show-minimap" checked={showMiniMap} onCheckedChange={setShowMiniMap} />
                <Label htmlFor="show-minimap">Show mini map</Label>
              </div>

              <div className="h-px bg-border my-4" />

              <Button variant="secondary" size="sm" onClick={onMockAnchors}>Mock Anchors</Button>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
