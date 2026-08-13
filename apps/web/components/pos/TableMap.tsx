"use client"

import React, { useState, useEffect, useRef } from "react"
import { Users, X, Move, Maximize2 } from "lucide-react"

export interface TableItem {
  id: string
  restaurantId: string
  sectionId: string
  number: string
  capacity: number
  posX: string | number
  posY: string | number
  width?: string | number
  height?: string | number
  shape?: "rectangle" | "circle" | "square" | string
  status: "free" | "occupied" | "reserved" | "waiting_bill" | "cleaning" | string
}

interface TableMapProps {
  tables: TableItem[]
  canvasWidth?: number
  canvasHeight?: number
  isEditMode?: boolean
  onTableClick?: (table: TableItem) => void
  onTableMoveEnd?: (tableId: string, posX: number, posY: number) => void
  onTableResizeEnd?: (tableId: string, width: number, height: number) => void
  onTableDelete?: (tableId: string) => void
}

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; badgeBg: string }> = {
  free: {
    bg: "bg-emerald-500/15 hover:bg-emerald-500/25",
    text: "text-emerald-300",
    border: "border-emerald-500/40",
    badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  },
  occupied: {
    bg: "bg-rose-500/15 hover:bg-rose-500/25",
    text: "text-rose-300",
    border: "border-rose-500/40",
    badgeBg: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  },
  reserved: {
    bg: "bg-indigo-500/15 hover:bg-indigo-500/25",
    text: "text-indigo-300",
    border: "border-indigo-500/40",
    badgeBg: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  },
  waiting_bill: {
    bg: "bg-amber-500/15 hover:bg-amber-500/25",
    text: "text-amber-300",
    border: "border-amber-500/40",
    badgeBg: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  },
  cleaning: {
    bg: "bg-purple-500/15 hover:bg-purple-500/25",
    text: "text-purple-300",
    border: "border-purple-500/40",
    badgeBg: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  },
}

export function TableMap({
  tables,
  canvasWidth = 1200,
  canvasHeight = 800,
  isEditMode = false,
  onTableClick,
  onTableMoveEnd,
  onTableResizeEnd,
  onTableDelete,
}: TableMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Local state for smooth drag & resize
  const [localTables, setLocalTables] = useState<TableItem[]>(tables)

  // Dragging / Resizing interaction tracking
  const [dragState, setDragState] = useState<{
    tableId: string
    startX: number
    startY: number
    initialPosX: number
    initialPosY: number
  } | null>(null)

  const [resizeState, setResizeState] = useState<{
    tableId: string
    startX: number
    startY: number
    initialWidth: number
    initialHeight: number
  } | null>(null)

  // Keep localTables in sync when props change (unless currently dragging/resizing)
  useEffect(() => {
    if (!dragState && !resizeState) {
      setLocalTables(tables)
    }
  }, [tables, dragState, resizeState])

  // Pointer Move Handler
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (dragState) {
        const deltaX = e.clientX - dragState.startX
        const deltaY = e.clientY - dragState.startY

        setLocalTables((prev) =>
          prev.map((t) => {
            if (t.id !== dragState.tableId) return t
            const w = Number(t.width) || 90
            const h = Number(t.height) || 90
            const newX = Math.max(0, Math.min(canvasWidth - w, Math.round(dragState.initialPosX + deltaX)))
            const newY = Math.max(0, Math.min(canvasHeight - h, Math.round(dragState.initialPosY + deltaY)))
            return { ...t, posX: newX, posY: newY }
          })
        )
      } else if (resizeState) {
        const deltaX = e.clientX - resizeState.startX
        const deltaY = e.clientY - resizeState.startY

        setLocalTables((prev) =>
          prev.map((t) => {
            if (t.id !== resizeState.tableId) return t
            const newW = Math.max(60, Math.min(300, Math.round(resizeState.initialWidth + deltaX)))
            const newH = Math.max(60, Math.min(300, Math.round(resizeState.initialHeight + deltaY)))
            return { ...t, width: newW, height: newH }
          })
        )
      }
    }

    const handlePointerUp = () => {
      if (dragState) {
        const updatedTable = localTables.find((t) => t.id === dragState.tableId)
        if (updatedTable) {
          onTableMoveEnd?.(updatedTable.id, Number(updatedTable.posX), Number(updatedTable.posY))
        }
        setDragState(null)
      }

      if (resizeState) {
        const updatedTable = localTables.find((t) => t.id === resizeState.tableId)
        if (updatedTable) {
          onTableResizeEnd?.(updatedTable.id, Number(updatedTable.width), Number(updatedTable.height))
        }
        setResizeState(null)
      }
    }

    if (dragState || resizeState) {
      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", handlePointerUp)
    }

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [dragState, resizeState, localTables, canvasWidth, canvasHeight, onTableMoveEnd, onTableResizeEnd])

  // Drag Start Handler
  const handleDragStart = (e: React.PointerEvent, table: TableItem) => {
    if (!isEditMode) return
    e.stopPropagation()
    setDragState({
      tableId: table.id,
      startX: e.clientX,
      startY: e.clientY,
      initialPosX: Number(table.posX) || 0,
      initialPosY: Number(table.posY) || 0,
    })
  }

  // Resize Start Handler
  const handleResizeStart = (e: React.PointerEvent, table: TableItem) => {
    if (!isEditMode) return
    e.stopPropagation()
    setResizeState({
      tableId: table.id,
      startX: e.clientX,
      startY: e.clientY,
      initialWidth: Number(table.width) || 90,
      initialHeight: Number(table.height) || 90,
    })
  }

  return (
    <div className="w-full overflow-auto rounded-2xl border border-slate-800 bg-slate-950/80 backdrop-blur-xl p-4 shadow-2xl relative select-none">
      {/* Blueprint grid background container */}
      <div
        ref={containerRef}
        className={`relative mx-auto rounded-xl border transition-all duration-300 overflow-hidden ${
          isEditMode
            ? "border-amber-500/40 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:20px_20px]"
            : "border-slate-850/80 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px]"
        }`}
        style={{
          width: `${canvasWidth}px`,
          height: `${canvasHeight}px`,
        }}
      >
        {/* Grid overlay badge for edit mode */}
        {isEditMode && (
          <div className="absolute top-3 left-3 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-semibold px-2.5 py-1 rounded-md pointer-events-none z-10 flex items-center gap-1.5">
            <Move className="h-3.5 w-3.5" />
            Modo Edición: Arrastrá mesas para reordenar
          </div>
        )}

        {localTables.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-6">
            <p className="text-sm font-medium text-slate-400">Esta sección aún no tiene mesas configuradas.</p>
            {isEditMode && (
              <p className="text-xs text-amber-400/80 mt-1">Usa el botón "Agregar Mesa" arriba para crear una nueva.</p>
            )}
          </div>
        ) : (
          localTables.map((table) => {
            const posX = Number(table.posX) || 0
            const posY = Number(table.posY) || 0
            const width = Number(table.width) || 90
            const height = Number(table.height) || 90

            const statusStyle = STATUS_STYLES[table.status] || {
              bg: "bg-slate-800/40 hover:bg-slate-800/60",
              text: "text-slate-300",
              border: "border-slate-700",
              badgeBg: "bg-slate-800 text-slate-300",
            }

            const shapeClasses =
              table.shape === "circle"
                ? "rounded-full"
                : table.shape === "square"
                  ? "rounded-xl"
                  : "rounded-xl"

            return (
              <div
                key={table.id}
                onPointerDown={(e) => isEditMode && handleDragStart(e, table)}
                onClick={() => !isEditMode && onTableClick?.(table)}
                style={{
                  position: "absolute",
                  left: `${posX}px`,
                  top: `${posY}px`,
                  width: `${width}px`,
                  height: `${height}px`,
                  touchAction: "none",
                }}
                className={`group border-2 transition-all duration-150 shadow-lg flex flex-col items-center justify-center p-2 text-center select-none ${shapeClasses} ${statusStyle.bg} ${
                  isEditMode
                    ? "border-amber-400/80 cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-amber-400/40"
                    : `cursor-pointer ${statusStyle.border}`
                }`}
              >
                {/* Delete button badge in Edit Mode */}
                {isEditMode && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onTableDelete?.(table.id)
                    }}
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-md transition-transform hover:scale-110 z-20"
                    title="Eliminar mesa"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Table Number */}
                <span className={`font-black tracking-tight text-sm md:text-base ${statusStyle.text}`}>
                  {table.number}
                </span>

                {/* Capacity & Icon */}
                <div className="flex items-center gap-1 mt-0.5 text-[11px] font-semibold opacity-90">
                  <Users className="h-3 w-3 shrink-0" />
                  <span>{table.capacity}p</span>
                </div>

                {/* Resize Handle in Edit Mode */}
                {isEditMode && (
                  <div
                    onPointerDown={(e) => handleResizeStart(e, table)}
                    className="absolute bottom-1 right-1 p-1 bg-amber-500/80 text-slate-950 rounded-md cursor-se-resize hover:bg-amber-400 transition-transform active:scale-125 z-20"
                    title="Redimensionar mesa"
                  >
                    <Maximize2 className="h-2.5 w-2.5" />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
