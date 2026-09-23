import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { processImage as processImageFile, revokePreviewUrl, validateImageFile } from "../utils/image.js";

// Image attachment: file select, drag-drop, paste + compressed preview.
// Owns selectedImage { previewUrl, base64, mimeType } and drag state.
export function useImageAttachment({ loading = false } = {}) {
  const [selectedImage, setSelectedImage] = useState(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const fileInputRef = useRef(null);
  const previewRef = useRef(null);
  useEffect(() => { previewRef.current = selectedImage?.previewUrl || null; }, [selectedImage]);
  // Revoke any lingering blob URL on unmount
  useEffect(() => () => {
    if (previewRef.current) revokePreviewUrl(previewRef.current);
  }, []);

  const processFile = useCallback(async (file) => {
    if (!file) return;
    const validation = validateImageFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }
    try {
      const { base64, mimeType, previewUrl } = await processImageFile(file);
      setSelectedImage((prev) => {
        if (prev?.previewUrl) revokePreviewUrl(prev.previewUrl);
        return { previewUrl, base64, mimeType };
      });
      toast.success("Image attached! Ask a question or press send.");
    } catch (err) {
      toast.error(err.message || "Failed to process image.");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const clearImage = useCallback(() => {
    setSelectedImage((prev) => {
      if (prev?.previewUrl) revokePreviewUrl(prev.previewUrl);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleImageChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!loading && !isDraggingImage) setIsDraggingImage(true);
  }, [loading, isDraggingImage]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    setIsDraggingImage(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingImage(false);
    if (loading) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) processFile(file);
  }, [loading, processFile]);

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          processFile(file);
          break;
        }
      }
    }
  }, [processFile]);

  return {
    selectedImage, setSelectedImage, clearImage,
    isDraggingImage, setIsDraggingImage,
    fileInputRef,
    processFile, handleImageChange, handleDragOver, handleDragLeave, handleDrop, handlePaste,
  };
}
