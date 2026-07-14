/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Save, ArrowUp, ArrowDown, GripVertical, Check, X, Sparkles, CheckSquare, Square, Info, Sliders, Ruler, HelpCircle, AlertTriangle } from 'lucide-react';
import { GarmentType, MeasurementField, StylingCategory, StylingOption } from '../types';

interface GarmentConfigurationProps {
  token: string;
}

export default function GarmentConfiguration({ token }: GarmentConfigurationProps) {
  // Global states
  const [garmentTypes, setGarmentTypes] = useState<GarmentType[]>([]);
  const [selectedType, setSelectedType] = useState<GarmentType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Custom Confirmation Dialog State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDangerous?: boolean;
  } | null>(null);

  // Custom Alert Dialog State
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  } | null>(null);

  const showConfirm = (title: string, message: string, onConfirm: () => void, isDangerous = false) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(null);
      },
      isDangerous
    });
  };

  const showAlert = (title: string, message: string) => {
    setAlertModal({
      isOpen: true,
      title,
      message
    });
  };

  // Section/Tab state for the configuration panel
  const [activeConfigSection, setActiveConfigSection] = useState<'MeasurementForm' | 'StylingLibrary'>('MeasurementForm');

  // Garment Type Form States
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypePrice, setNewTypePrice] = useState('');
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingTypeName, setEditingTypeName] = useState('');
  const [selectedTypePrice, setSelectedTypePrice] = useState<number | '' | null>(null);
  const [savingPrice, setSavingPrice] = useState(false);

  // Measurement Form Builder States
  const [builderFields, setBuilderFields] = useState<MeasurementField[]>([]);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null);
  const [editingFieldName, setEditingFieldName] = useState('');
  const [saveFieldsSuccess, setSaveFieldsSuccess] = useState(false);

  // Styling Library States
  const [stylingCategories, setStylingCategories] = useState<StylingCategory[]>([]);
  const [selectedStylingCategory, setSelectedStylingCategory] = useState<StylingCategory | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  // Styling Options States
  const [builderOptions, setBuilderOptions] = useState<StylingOption[]>([]);
  const [newOptionName, setNewOptionName] = useState('');
  const [editingOptionIndex, setEditingOptionIndex] = useState<number | null>(null);
  const [editingOptionName, setEditingOptionName] = useState('');
  const [saveOptionsSuccess, setSaveOptionsSuccess] = useState(false);

  // Drag and Drop States
  const [draggedTypeIdx, setDraggedTypeIdx] = useState<number | null>(null);
  const [draggedFieldIdx, setDraggedFieldIdx] = useState<number | null>(null);
  const [draggedCategoryIdx, setDraggedCategoryIdx] = useState<number | null>(null);
  const [draggedOptionIdx, setDraggedOptionIdx] = useState<number | null>(null);

  // Load garment types on boot
  useEffect(() => {
    fetchGarmentTypes();
  }, [token]);

  // Synchronize measurement fields and fetch styling categories when the selected garment type changes
  useEffect(() => {
    setError(null);
    setSuccess(null);
    if (selectedType) {
      setSelectedTypePrice(selectedType.price !== undefined ? selectedType.price : 0);
      // Synchronize measurement form builder
      setBuilderFields(
        [...(selectedType.measurement_fields || [])].sort((a, b) => a.display_order - b.display_order)
      );
      setSaveFieldsSuccess(false);
      setEditingFieldIndex(null);
      setNewFieldName('');
      setNewFieldRequired(false);

      // Fetch styling categories for this garment type
      fetchStylingCategories(selectedType.id);
    } else {
      setSelectedTypePrice(null);
      setBuilderFields([]);
      setStylingCategories([]);
      setSelectedStylingCategory(null);
    }
  }, [selectedType]);

  // Synchronize styling option builder when styling category changes
  useEffect(() => {
    if (selectedStylingCategory) {
      setBuilderOptions(
        [...(selectedStylingCategory.options || [])].sort((a, b) => a.display_order - b.display_order)
      );
      setSaveOptionsSuccess(false);
      setEditingOptionIndex(null);
      setNewOptionName('');
    } else {
      setBuilderOptions([]);
    }
  }, [selectedStylingCategory]);

  // -------------------------------------------------------------------------
  // SECTION 1: GARMENT TYPES API LOGIC
  // -------------------------------------------------------------------------
  const fetchGarmentTypes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/garment-types', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setGarmentTypes(data);
        if (data.length > 0) {
          // Keep current selection or default to first
          if (selectedType) {
            const currentSelected = data.find((gt: GarmentType) => gt.id === selectedType.id);
            setSelectedType(currentSelected || data[0]);
          } else {
            setSelectedType(data[0]);
          }
        } else {
          setSelectedType(null);
        }
      } else {
        setError(data.error || 'Failed to load garment types');
      }
    } catch (err) {
      setError('Connection failed. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddGarmentType = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newTypeName.trim();
    if (!name) return;

    setError(null);
    setSuccess(null);

    if (garmentTypes.some(gt => gt.name.toLowerCase() === name.toLowerCase())) {
      setError(`A garment type named "${name}" already exists.`);
      return;
    }

    const price = newTypePrice ? Number(newTypePrice) : 0;

    try {
      const res = await fetch('/api/garment-types', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          enabled: true,
          price,
          measurement_fields: []
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(`Garment type "${name}" created successfully.`);
        setNewTypeName('');
        setNewTypePrice('');
        // This will reload the list and preserve selection
        fetchGarmentTypes();
      } else {
        setError(data.error || 'Failed to add garment type.');
      }
    } catch (err) {
      setError('Connection failed.');
    }
  };

  const handleSavePrice = async () => {
    if (!selectedType || selectedTypePrice === null) return;
    setError(null);
    setSuccess(null);
    setSavingPrice(true);

    const priceToSave = selectedTypePrice === '' ? 0 : Number(selectedTypePrice);

    try {
      const res = await fetch(`/api/garment-types/${selectedType.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          price: priceToSave
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(`Base price for "${selectedType.name}" updated to Rs. ${priceToSave} successfully.`);
        // Update local list
        setGarmentTypes(prev => prev.map(gt => {
          if (gt.id === selectedType.id) {
            return { ...gt, price: priceToSave };
          }
          return gt;
        }));
        setSelectedType(prev => prev ? { ...prev, price: priceToSave } : null);
      } else {
        setError(data.error || 'Failed to update base price.');
      }
    } catch (err) {
      setError('Connection failed.');
    } finally {
      setSavingPrice(false);
    }
  };

  const handleRenameGarmentType = async (id: string) => {
    const newName = editingTypeName.trim();
    if (!newName) return;

    setError(null);
    setSuccess(null);

    if (garmentTypes.some(gt => gt.id !== id && gt.name.toLowerCase() === newName.toLowerCase())) {
      setError(`Another garment type named "${newName}" already exists.`);
      return;
    }

    try {
      const res = await fetch(`/api/garment-types/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newName }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(`Garment type renamed to "${newName}" successfully.`);
        setEditingTypeId(null);
        fetchGarmentTypes();
      } else {
        setError(data.error || 'Failed to rename garment type.');
      }
    } catch (err) {
      setError('Connection failed.');
    }
  };

  const handleToggleGarmentTypeEnable = async (type: GarmentType) => {
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/garment-types/${type.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: !type.enabled }),
      });

      if (res.ok) {
        fetchGarmentTypes();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update garment type status.');
      }
    } catch (err) {
      setError('Connection failed.');
    }
  };

  const handleDeleteGarmentType = async (type: GarmentType) => {
    // Clear and prominent warning as explicitly requested by the user
    const title = `⚠️ DELETE GARMENT TYPE "${type.name.toUpperCase()}" ⚠️`;
    const message = `This action cannot be undone. Doing so will PERMANENTLY REMOVE:
1. The Custom Measurement Form layout defined for this garment type.
2. All custom Styling Library categories and options linked to this garment type.

Do you absolutely want to proceed with deletion?`;

    showConfirm(title, message, async () => {
      setError(null);
      setSuccess(null);

      try {
        const res = await fetch(`/api/garment-types/${type.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();
        if (res.ok) {
          setSuccess(`Garment type "${type.name}" and all of its linked configurations were deleted successfully.`);
          if (selectedType?.id === type.id) {
            setSelectedType(null);
          }
          fetchGarmentTypes();
        } else {
          setError(data.error || 'Failed to delete garment type.');
        }
      } catch (err) {
        setError('Connection failed.');
      }
    }, true);
  };

  const handleMoveGarmentType = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === garmentTypes.length - 1) return;

    const reordered = [...garmentTypes];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    // Swap items
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    const ids = reordered.map(gt => gt.id);

    try {
      const res = await fetch('/api/garment-types/reorder', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids }),
      });

      if (res.ok) {
        setGarmentTypes(reordered);
        if (selectedType) {
          const updatedSelected = reordered.find(gt => gt.id === selectedType.id);
          if (updatedSelected) setSelectedType(updatedSelected);
        }
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to reorder garment types.');
      }
    } catch (err) {
      setError('Connection failed.');
    }
  };

  const handleDragStartType = (idx: number) => {
    setDraggedTypeIdx(idx);
  };

  const handleDragOverType = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
  };

  const handleDropType = async (idx: number) => {
    if (draggedTypeIdx === null || draggedTypeIdx === idx) return;

    const reordered = [...garmentTypes];
    const draggedItem = reordered[draggedTypeIdx];
    reordered.splice(draggedTypeIdx, 1);
    reordered.splice(idx, 0, draggedItem);

    setDraggedTypeIdx(null);
    const ids = reordered.map(gt => gt.id);

    try {
      const res = await fetch('/api/garment-types/reorder', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids }),
      });

      if (res.ok) {
        setGarmentTypes(reordered);
        if (selectedType) {
          const updatedSelected = reordered.find(gt => gt.id === selectedType.id);
          if (updatedSelected) setSelectedType(updatedSelected);
        }
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to reorder garment types.');
      }
    } catch (err) {
      setError('Connection failed.');
    }
  };


  // -------------------------------------------------------------------------
  // SECTION 2: MEASUREMENT FORM BUILDER LOGIC
  // -------------------------------------------------------------------------
  const handleAddField = (e: React.FormEvent) => {
    e.preventDefault();
    const fieldName = newFieldName.trim();
    if (!fieldName) return;

    if (builderFields.some(f => f.name.toLowerCase() === fieldName.toLowerCase())) {
      showAlert('Duplicate Parameter', `A measurement field named "${fieldName}" already exists in this form.`);
      return;
    }

    const newField: MeasurementField = {
      name: fieldName,
      required: newFieldRequired,
      display_order: builderFields.length
    };

    setBuilderFields([...builderFields, newField]);
    setNewFieldName('');
    setNewFieldRequired(false);
    setSaveFieldsSuccess(false);
  };

  const handleRemoveField = (index: number) => {
    const updated = builderFields.filter((_, idx) => idx !== index).map((f, idx) => ({
      ...f,
      display_order: idx
    }));
    setBuilderFields(updated);
    setSaveFieldsSuccess(false);
    if (editingFieldIndex === index) {
      setEditingFieldIndex(null);
    }
  };

  const handleToggleFieldRequired = (index: number) => {
    const updated = [...builderFields];
    updated[index] = { ...updated[index], required: !updated[index].required };
    setBuilderFields(updated);
    setSaveFieldsSuccess(false);
  };

  const handleSaveFieldName = (index: number) => {
    const newName = editingFieldName.trim();
    if (!newName) return;

    if (builderFields.some((f, idx) => idx !== index && f.name.toLowerCase() === newName.toLowerCase())) {
      showAlert('Duplicate Parameter', `Another field named "${newName}" already exists in this form.`);
      return;
    }

    const updated = [...builderFields];
    updated[index] = { ...updated[index], name: newName };
    setBuilderFields(updated);
    setEditingFieldIndex(null);
    setSaveFieldsSuccess(false);
  };

  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === builderFields.length - 1) return;

    const updated = [...builderFields];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;

    // Swap
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;

    // Recompute display orders
    const sorted = updated.map((f, idx) => ({ ...f, display_order: idx }));
    setBuilderFields(sorted);
    setSaveFieldsSuccess(false);
  };

  const handleDragStartField = (idx: number) => {
    setDraggedFieldIdx(idx);
  };

  const handleDragOverField = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
  };

  const handleDropField = (idx: number) => {
    if (draggedFieldIdx === null || draggedFieldIdx === idx) return;

    const reordered = [...builderFields];
    const draggedItem = reordered[draggedFieldIdx];
    reordered.splice(draggedFieldIdx, 1);
    reordered.splice(idx, 0, draggedItem);

    const sorted = reordered.map((f, idx) => ({ ...f, display_order: idx }));
    setBuilderFields(sorted);
    setDraggedFieldIdx(null);
    setSaveFieldsSuccess(false);
  };

  const handleSaveMeasurementForm = async () => {
    if (!selectedType) return;
    setError(null);
    setSuccess(null);
    setSaveFieldsSuccess(false);

    try {
      const res = await fetch(`/api/garment-types/${selectedType.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          measurement_fields: builderFields
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSaveFieldsSuccess(true);
        // Update local list
        setGarmentTypes(prev => prev.map(gt => {
          if (gt.id === selectedType.id) {
            return { ...gt, measurement_fields: builderFields };
          }
          return gt;
        }));
        setSelectedType(prev => prev ? { ...prev, measurement_fields: builderFields } : null);
      } else {
        setError(data.error || 'Failed to save measurement form layout.');
      }
    } catch (err) {
      setError('Connection failed.');
    }
  };


  // -------------------------------------------------------------------------
  // SECTION 3: STYLING LIBRARY API LOGIC
  // -------------------------------------------------------------------------
  const fetchStylingCategories = async (garmentTypeId: string) => {
    try {
      const res = await fetch(`/api/styling-categories?garment_type_id=${garmentTypeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setStylingCategories(data);
        if (data.length > 0) {
          // Keep current category selection or choose first
          if (selectedStylingCategory) {
            const currentSelected = data.find((sc: StylingCategory) => sc.id === selectedStylingCategory.id);
            setSelectedStylingCategory(currentSelected || data[0]);
          } else {
            setSelectedStylingCategory(data[0]);
          }
        } else {
          setSelectedStylingCategory(null);
        }
      } else {
        console.error('Failed to load styling categories:', data.error);
      }
    } catch (err) {
      console.error('Connection failed fetching styling categories:', err);
    }
  };

  const handleAddStylingCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType) return;
    const name = newCategoryName.trim();
    if (!name) return;

    setError(null);
    setSuccess(null);

    if (stylingCategories.some(sc => sc.name.toLowerCase() === name.toLowerCase())) {
      setError(`A style category named "${name}" already exists for this garment.`);
      return;
    }

    try {
      const res = await fetch('/api/styling-categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          display_order: stylingCategories.length,
          options: [],
          garment_type_id: selectedType.id
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(`Style category "${name}" created successfully.`);
        setNewCategoryName('');
        fetchStylingCategories(selectedType.id);
      } else {
        setError(data.error || 'Failed to add style category.');
      }
    } catch (err) {
      setError('Connection failed.');
    }
  };

  const handleRenameStylingCategory = async (id: string) => {
    if (!selectedType) return;
    const newName = editingCategoryName.trim();
    if (!newName) return;

    setError(null);
    setSuccess(null);

    if (stylingCategories.some(sc => sc.id !== id && sc.name.toLowerCase() === newName.toLowerCase())) {
      setError(`Another style category named "${newName}" already exists.`);
      return;
    }

    try {
      const res = await fetch(`/api/styling-categories/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newName }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(`Style category renamed to "${newName}" successfully.`);
        setEditingCategoryId(null);
        fetchStylingCategories(selectedType.id);
      } else {
        setError(data.error || 'Failed to rename style category.');
      }
    } catch (err) {
      setError('Connection failed.');
    }
  };

  const handleDeleteStylingCategory = async (category: StylingCategory) => {
    if (!selectedType) return;
    const title = `Delete Styling Category "${category.name}"?`;
    const message = `Are you sure you want to delete styling category "${category.name}"? This will delete all style options defined under this category. This action cannot be undone.`;

    showConfirm(title, message, async () => {
      setError(null);
      setSuccess(null);

      try {
        const res = await fetch(`/api/styling-categories/${category.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();
        if (res.ok) {
          setSuccess(`Styling category "${category.name}" deleted successfully.`);
          if (selectedStylingCategory?.id === category.id) {
            setSelectedStylingCategory(null);
          }
          fetchStylingCategories(selectedType.id);
        } else {
          setError(data.error || 'Failed to delete styling category.');
        }
      } catch (err) {
        setError('Connection failed.');
      }
    }, true);
  };

  const handleMoveStylingCategory = async (index: number, direction: 'up' | 'down') => {
    if (!selectedType) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === stylingCategories.length - 1) return;

    const reordered = [...stylingCategories];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    // Swap items
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    const ids = reordered.map(sc => sc.id);

    try {
      const res = await fetch('/api/styling-categories/reorder', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids }),
      });

      if (res.ok) {
        setStylingCategories(reordered);
        if (selectedStylingCategory) {
          const updatedSelected = reordered.find(sc => sc.id === selectedStylingCategory.id);
          if (updatedSelected) setSelectedStylingCategory(updatedSelected);
        }
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to reorder style categories.');
      }
    } catch (err) {
      setError('Connection failed.');
    }
  };

  const handleDragStartCategory = (idx: number) => {
    setDraggedCategoryIdx(idx);
  };

  const handleDragOverCategory = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
  };

  const handleDropCategory = async (idx: number) => {
    if (!selectedType) return;
    if (draggedCategoryIdx === null || draggedCategoryIdx === idx) return;

    const reordered = [...stylingCategories];
    const draggedItem = reordered[draggedCategoryIdx];
    reordered.splice(draggedCategoryIdx, 1);
    reordered.splice(idx, 0, draggedItem);

    setDraggedCategoryIdx(null);
    const ids = reordered.map(sc => sc.id);

    try {
      const res = await fetch('/api/styling-categories/reorder', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids }),
      });

      if (res.ok) {
        setStylingCategories(reordered);
        if (selectedStylingCategory) {
          const updatedSelected = reordered.find(sc => sc.id === selectedStylingCategory.id);
          if (updatedSelected) setSelectedStylingCategory(updatedSelected);
        }
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to reorder styling categories.');
      }
    } catch (err) {
      setError('Connection failed.');
    }
  };


  // -------------------------------------------------------------------------
  // OPTIONS BUILDER LOGIC FOR SELECTED STYLE CATEGORY
  // -------------------------------------------------------------------------
  const handleAddOption = (e: React.FormEvent) => {
    e.preventDefault();
    const optName = newOptionName.trim();
    if (!optName) return;

    if (builderOptions.some(o => o.name.toLowerCase() === optName.toLowerCase())) {
      showAlert('Duplicate Option', `An option named "${optName}" already exists in this category.`);
      return;
    }

    const newOpt: StylingOption = {
      id: 'opt-' + Math.random().toString(36).substring(2, 11),
      name: optName,
      enabled: true,
      display_order: builderOptions.length
    };

    setBuilderOptions([...builderOptions, newOpt]);
    setNewOptionName('');
    setSaveOptionsSuccess(false);
  };

  const handleRemoveOption = (index: number) => {
    const updated = builderOptions.filter((_, idx) => idx !== index).map((o, idx) => ({
      ...o,
      display_order: idx
    }));
    setBuilderOptions(updated);
    setSaveOptionsSuccess(false);
    if (editingOptionIndex === index) {
      setEditingOptionIndex(null);
    }
  };

  const handleToggleOptionEnable = (index: number) => {
    const updated = [...builderOptions];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    setBuilderOptions(updated);
    setSaveOptionsSuccess(false);
  };

  const handleSaveOptionName = (index: number) => {
    const newName = editingOptionName.trim();
    if (!newName) return;

    if (builderOptions.some((o, idx) => idx !== index && o.name.toLowerCase() === newName.toLowerCase())) {
      showAlert('Duplicate Option', `Another option named "${newName}" already exists in this category.`);
      return;
    }

    const updated = [...builderOptions];
    updated[index] = { ...updated[index], name: newName };
    setBuilderOptions(updated);
    setEditingOptionIndex(null);
    setSaveOptionsSuccess(false);
  };

  const handleMoveOption = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === builderOptions.length - 1) return;

    const updated = [...builderOptions];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;

    // Swap
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;

    const sorted = updated.map((o, idx) => ({ ...o, display_order: idx }));
    setBuilderOptions(sorted);
    setSaveOptionsSuccess(false);
  };

  const handleDragStartOption = (idx: number) => {
    setDraggedOptionIdx(idx);
  };

  const handleDragOverOption = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
  };

  const handleDropOption = (idx: number) => {
    if (draggedOptionIdx === null || draggedOptionIdx === idx) return;

    const reordered = [...builderOptions];
    const draggedItem = reordered[draggedOptionIdx];
    reordered.splice(draggedOptionIdx, 1);
    reordered.splice(idx, 0, draggedItem);

    const sorted = reordered.map((o, idx) => ({ ...o, display_order: idx }));
    setBuilderOptions(sorted);
    setDraggedOptionIdx(null);
    setSaveOptionsSuccess(false);
  };

  const handleSaveCategoryOptions = async () => {
    if (!selectedStylingCategory || !selectedType) return;
    setError(null);
    setSuccess(null);
    setSaveOptionsSuccess(false);

    try {
      const res = await fetch(`/api/styling-categories/${selectedStylingCategory.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          options: builderOptions
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSaveOptionsSuccess(true);
        // Sync local list
        setStylingCategories(prev => prev.map(sc => {
          if (sc.id === selectedStylingCategory.id) {
            return { ...sc, options: builderOptions };
          }
          return sc;
        }));
        setSelectedStylingCategory(prev => prev ? { ...prev, options: builderOptions } : null);
      } else {
        setError(data.error || 'Failed to save styling options.');
      }
    } catch (err) {
      setError('Connection failed.');
    }
  };


  return (
    <div className="space-y-6">
      {/* Title & Description */}
      <div>
        <h3 className="text-lg font-bold text-slate-900 uppercase tracking-wider font-display flex items-center gap-2">
          <Sliders className="w-5 h-5 text-[#38BDF8]" />
          Garment Configuration
        </h3>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-3xl">
          Unified command center for administrating your shop's catalog. Configure unique garment types, construct custom measurement forms for each category, and maintain matching design choices in the styling library.
        </p>
      </div>

      {/* Unified Error & Success Banners */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-center gap-2 shadow-2xs">
          <X className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2 shadow-2xs animate-fade-in">
          <Check className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{success}</span>
        </div>
      )}

      {/* Main Grid: Sidebar (4/12 cols) & Detail Config Frame (8/12 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* SECTION 1: GARMENT TYPES SIDEBAR */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Create Form */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Add New Catalog Garment</span>
            <form onSubmit={handleAddGarmentType} className="space-y-2.5">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Garment Name</label>
                <input
                  type="text"
                  required
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="e.g. Shalwar Kameez, Suit, Shirt"
                  className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-slate-800 text-xs font-semibold focus:outline-none focus:border-[#38BDF8]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Base Price (Rs.)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={newTypePrice}
                  onChange={(e) => setNewTypePrice(e.target.value)}
                  placeholder="e.g. 2500"
                  className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-slate-800 text-xs font-semibold focus:outline-none focus:border-[#38BDF8]"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-[#0F172A] hover:bg-[#1E293B] text-white font-extrabold rounded-xl text-btn-sm uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="icon-sm text-[#38BDF8]" />
                Add Garment
              </button>
            </form>
          </div>

          {/* List of Garment Types */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Garment Catalog List</span>
              <span className="text-3xs font-bold text-slate-400 uppercase tracking-widest">{garmentTypes.length} registered</span>
            </div>

            <div className="divide-y divide-slate-150 max-h-[480px] overflow-y-auto bg-white">
              {loading && garmentTypes.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">
                  Retrieving catalog data...
                </div>
              ) : garmentTypes.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs font-semibold uppercase tracking-wider flex flex-col items-center gap-2">
                  <Info className="w-8 h-8 text-slate-300" />
                  No garment types registered. Please add a garment type to begin configuration.
                </div>
              ) : (
                garmentTypes.map((type, idx) => {
                  const isSelected = selectedType?.id === type.id;
                  const isEditing = editingTypeId === type.id;

                  return (
                    <div
                      key={type.id}
                      draggable={!isEditing}
                      onDragStart={() => handleDragStartType(idx)}
                      onDragOver={(e) => handleDragOverType(e, idx)}
                      onDrop={() => handleDropType(idx)}
                      onClick={() => !isEditing && setSelectedType(type)}
                      className={`group p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-all border-l-4 select-none ${
                        isSelected 
                          ? 'bg-[#F1F5F9] border-[#0F172A]' 
                          : 'hover:bg-slate-50/70 border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        {/* Drag Handle */}
                        <div className="text-slate-300 group-hover:text-slate-400 transition-colors p-0.5 shrink-0 cursor-grab active:cursor-grabbing">
                          <GripVertical className="w-4 h-4" />
                        </div>

                        {/* Move buttons */}
                        <div className="flex flex-col shrink-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleMoveGarmentType(idx, 'up'); }}
                            disabled={idx === 0}
                            className="p-0.5 rounded text-slate-400 hover:text-[#38BDF8] disabled:opacity-20 cursor-pointer hover:bg-slate-100"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleMoveGarmentType(idx, 'down'); }}
                            disabled={idx === garmentTypes.length - 1}
                            className="p-0.5 rounded text-slate-400 hover:text-[#38BDF8] disabled:opacity-20 cursor-pointer hover:bg-slate-100"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            <div className="flex gap-1.5 items-center w-full" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                required
                                value={editingTypeName}
                                onChange={(e) => setEditingTypeName(e.target.value)}
                                className="px-2 py-1 bg-white border border-slate-300 rounded-md text-xs font-bold text-slate-800 focus:outline-none focus:border-[#38BDF8] w-full"
                              />
                              <button
                                type="button"
                                onClick={() => handleRenameGarmentType(type.id)}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer shrink-0"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTypeId(null)}
                                className="p-1 text-red-500 hover:bg-red-50 rounded cursor-pointer shrink-0"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col">
                              <span className={`text-xs font-extrabold ${type.enabled ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                                {type.name}
                              </span>
                              <div className="flex gap-1.5 items-center text-[10px] font-bold text-slate-400 mt-0.5">
                                <span>{type.measurement_fields?.length || 0} measurements</span>
                                <span>•</span>
                                <span className="text-emerald-600">Rs. {type.price || 0}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action items */}
                      {!isEditing && (
                        <div className="flex items-center gap-1 shrink-0 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Toggle Active status */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleToggleGarmentTypeEnable(type); }}
                            className={`p-1 rounded-md text-3xs font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                              type.enabled 
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' 
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                            title={type.enabled ? 'Disable Garment Type' : 'Enable Garment Type'}
                          >
                            {type.enabled ? 'Active' : 'Muted'}
                          </button>

                          {/* Rename */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTypeId(type.id);
                              setEditingTypeName(type.name);
                            }}
                            className="p-1 text-slate-500 hover:text-[#38BDF8] hover:bg-slate-100 rounded cursor-pointer transition-colors"
                            title="Rename"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDeleteGarmentType(type); }}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded cursor-pointer transition-colors"
                            title="Delete Garment Type & All Configs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* DETAILS SECTION (8/12 cols): Config panel for the selected garment type */}
        <div className="lg:col-span-8">
          {selectedType ? (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
              
              {/* Garment Type General Settings / Price */}
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Garment Category</span>
                  <span className="text-body font-extrabold text-slate-800 font-display">{selectedType.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider sm:text-right">Base Price</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-body-sm font-bold text-slate-500">Rs.</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={selectedTypePrice !== null ? selectedTypePrice : (selectedType.price || 0)}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedTypePrice(val === '' ? '' : Number(val));
                        }}
                        className="w-24 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-body-sm font-bold text-slate-800 focus:outline-none focus:border-[#38BDF8]"
                      />
                      <button
                        type="button"
                        onClick={handleSavePrice}
                        disabled={savingPrice || selectedTypePrice === null}
                        className="px-3 py-2 bg-[#0F172A] hover:bg-[#1E293B] text-white font-extrabold rounded-lg text-btn-sm uppercase tracking-wider cursor-pointer flex items-center gap-1 shrink-0 transition-colors disabled:opacity-45"
                      >
                        {savingPrice ? 'Saving...' : 'Save Price'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Header Tab Switching */}
              <div className="flex border-b border-slate-200 bg-slate-50/50">
                <button
                  type="button"
                  onClick={() => setActiveConfigSection('MeasurementForm')}
                  className={`flex-1 py-3 px-4 font-bold text-btn-sm uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer ${
                    activeConfigSection === 'MeasurementForm'
                      ? 'border-[#0F172A] text-slate-800 bg-white'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Ruler className="icon-sm text-[#38BDF8]" />
                  Measurement Form Builder
                </button>
                <button
                  type="button"
                  onClick={() => setActiveConfigSection('StylingLibrary')}
                  className={`flex-1 py-3 px-4 font-bold text-btn-sm uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer ${
                    activeConfigSection === 'StylingLibrary'
                      ? 'border-[#0F172A] text-slate-800 bg-white'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Sparkles className="icon-sm text-[#38BDF8]" />
                  Styling Library options
                </button>
              </div>

              {/* Tab Content Panel */}
              <div className="p-6">
                
                {/* SUBSECTION A: MEASUREMENT FORM BUILDER */}
                {activeConfigSection === 'MeasurementForm' && (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-body font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 font-display">
                        Form Layout Builder: {selectedType.name}
                      </h4>
                      <p className="text-caption text-slate-400 leading-normal mt-0.5">
                        Define which measurements are required from customers when they order a {selectedType.name}. Add parameters (e.g. Chest, Inseam, Collar), rearrange their order, or mandate specific entries.
                      </p>
                    </div>

                    {/* New Field Creator Form */}
                    <form onSubmit={handleAddField} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap gap-3 items-end">
                      <div className="flex-1 min-w-[200px] space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Parameter Name</label>
                        <input
                          type="text"
                          required
                          value={newFieldName}
                          onChange={(e) => setNewFieldName(e.target.value)}
                          placeholder="e.g. Chest Circumference, Sleeve"
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs font-semibold focus:outline-none focus:border-[#38BDF8]"
                        />
                      </div>

                      <div className="flex items-center gap-2 h-9">
                        <button
                          type="button"
                          onClick={() => setNewFieldRequired(!newFieldRequired)}
                          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors cursor-pointer select-none"
                        >
                          {newFieldRequired ? (
                            <CheckSquare className="w-4 h-4 text-[#38BDF8] shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 shrink-0" />
                          )}
                          <span>Required Entry</span>
                        </button>
                      </div>

                      <button
                        type="submit"
                        className="px-4 py-2 bg-[#0F172A] hover:bg-slate-800 text-white font-extrabold text-2xs uppercase tracking-wider rounded-lg flex items-center gap-1 cursor-pointer transition-colors shrink-0 h-9"
                      >
                        <Plus className="w-4 h-4 text-[#38BDF8]" />
                        Insert Field
                      </button>
                    </form>

                    {/* Draggable fields layout */}
                    <div className="space-y-2">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Fields Layout & Preview</span>
                      
                      {builderFields.length === 0 ? (
                        <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-400 text-xs font-semibold uppercase tracking-wider">
                          No custom measurement fields built. Add your first custom field above.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-xl overflow-hidden">
                          {builderFields.map((field, idx) => {
                            const isFieldEditing = editingFieldIndex === idx;

                            return (
                              <div
                                key={idx}
                                draggable={!isFieldEditing}
                                onDragStart={() => handleDragStartField(idx)}
                                onDragOver={(e) => handleDragOverField(e, idx)}
                                onDrop={() => handleDropField(idx)}
                                className="group p-3 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors select-none"
                              >
                                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                  {/* Drag icon */}
                                  <div className="text-slate-300 group-hover:text-slate-400 transition-colors cursor-grab active:cursor-grabbing p-0.5">
                                    <GripVertical className="w-4 h-4" />
                                  </div>

                                  {/* Move arrows */}
                                  <div className="flex flex-col shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleMoveField(idx, 'up')}
                                      disabled={idx === 0}
                                      className="p-0.5 text-slate-400 hover:text-[#38BDF8] disabled:opacity-10 cursor-pointer"
                                      title="Move Up"
                                    >
                                      <ArrowUp className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleMoveField(idx, 'down')}
                                      disabled={idx === builderFields.length - 1}
                                      className="p-0.5 text-slate-400 hover:text-[#38BDF8] disabled:opacity-10 cursor-pointer"
                                      title="Move Down"
                                    >
                                      <ArrowDown className="w-3 h-3" />
                                    </button>
                                  </div>

                                  {/* Field content */}
                                  <div className="flex-1 min-w-0">
                                    {isFieldEditing ? (
                                      <div className="flex gap-1.5 items-center max-w-md">
                                        <input
                                          type="text"
                                          required
                                          value={editingFieldName}
                                          onChange={(e) => setEditingFieldName(e.target.value)}
                                          className="px-2 py-1 bg-white border border-slate-300 rounded-md text-xs font-bold text-slate-800 focus:outline-none w-full"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleSaveFieldName(idx)}
                                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer shrink-0"
                                        >
                                          <Check className="w-4 h-4" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingFieldIndex(null)}
                                          className="p-1 text-red-500 hover:bg-red-50 rounded cursor-pointer shrink-0"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-extrabold text-slate-800">{field.name}</span>
                                        {field.required && (
                                          <span className="text-3xs font-extrabold text-red-500 uppercase tracking-wider bg-red-50 border border-red-100 rounded px-1">
                                            Required
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Field actions */}
                                {!isFieldEditing && (
                                  <div className="flex items-center gap-1 shrink-0 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleFieldRequired(idx)}
                                      className={`px-2 py-1 text-3xs font-bold rounded uppercase cursor-pointer ${
                                        field.required 
                                          ? 'bg-red-50 text-red-600 hover:bg-red-100' 
                                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                      }`}
                                    >
                                      {field.required ? 'Required' : 'Optional'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingFieldIndex(idx);
                                        setEditingFieldName(field.name);
                                      }}
                                      className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                                      title="Rename parameter"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveField(idx)}
                                      className="p-1 text-red-500 hover:text-red-700 rounded cursor-pointer"
                                      title="Remove parameter"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Save Button for layouts */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                        {saveFieldsSuccess && (
                          <span className="text-emerald-600 flex items-center gap-1 animate-fade-in">
                            <Check className="w-4 h-4 text-emerald-500" />
                            Layout persisted successfully
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleSaveMeasurementForm}
                        className="px-5 py-2.5 bg-[#0F172A] hover:bg-slate-800 text-white font-extrabold rounded-xl text-btn-sm uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
                      >
                        <Save className="icon-sm text-[#38BDF8]" />
                        Save Form Layout
                      </button>
                    </div>
                  </div>
                )}


                {/* SUBSECTION B: STYLING LIBRARY FOR SELECTED GARMENT */}
                {activeConfigSection === 'StylingLibrary' && (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-body font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 font-display">
                        Styling Library options: {selectedType.name}
                      </h4>
                      <p className="text-caption text-slate-400 leading-normal mt-0.5">
                        Define custom style categories (e.g. Collars, Cuffs, Sleeves, Pockets) specifically for {selectedType.name}s. Within each style category, register specific style design configurations.
                      </p>
                    </div>

                    {/* Layout Split: Categories sidebar & options detail */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start border border-slate-150 rounded-2xl overflow-hidden p-4 bg-slate-50/50">
                      
                      {/* Left: Styling categories inside the selected garment */}
                      <div className="md:col-span-5 space-y-4">
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">1. Style Categories</span>
                          
                          {/* New category name creator */}
                          <form onSubmit={handleAddStylingCategory} className="flex gap-1.5">
                            <input
                              type="text"
                              required
                              value={newCategoryName}
                              onChange={(e) => setNewCategoryName(e.target.value)}
                              placeholder="e.g. Collar Type"
                              className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-2xs font-semibold focus:outline-none"
                            />
                            <button
                              type="submit"
                              className="p-2 bg-[#0F172A] hover:bg-slate-800 rounded-lg text-white cursor-pointer shrink-0"
                              title="Create style category"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </form>

                          {/* List of styling categories */}
                          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden bg-white max-h-80 overflow-y-auto">
                            {stylingCategories.length === 0 ? (
                              <p className="p-4 text-center text-slate-400 text-3xs font-extrabold uppercase tracking-wider">No categories built.</p>
                            ) : (
                              stylingCategories.map((category, idx) => {
                                const isCategorySelected = selectedStylingCategory?.id === category.id;
                                const isCategoryEditing = editingCategoryId === category.id;

                                return (
                                  <div
                                    key={category.id}
                                    draggable={!isCategoryEditing}
                                    onDragStart={() => handleDragStartCategory(idx)}
                                    onDragOver={(e) => handleDragOverCategory(e, idx)}
                                    onDrop={() => handleDropCategory(idx)}
                                    onClick={() => !isCategoryEditing && setSelectedStylingCategory(category)}
                                    className={`p-2.5 flex items-center justify-between gap-2 cursor-pointer select-none transition-colors border-l-3 ${
                                      isCategorySelected 
                                        ? 'bg-slate-100/80 border-[#0F172A]' 
                                        : 'hover:bg-slate-50 border-transparent'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                      <GripVertical className="w-3 h-3 text-slate-300 shrink-0 cursor-grab" />
                                      
                                      <div className="flex flex-col shrink-0 text-slate-400">
                                        <button
                                          type="button"
                                          disabled={idx === 0}
                                          onClick={(e) => { e.stopPropagation(); handleMoveStylingCategory(idx, 'up'); }}
                                          className="p-0.5 hover:text-[#38BDF8] disabled:opacity-20 cursor-pointer"
                                        >
                                          <ArrowUp className="w-2.5 h-2.5" />
                                        </button>
                                        <button
                                          type="button"
                                          disabled={idx === stylingCategories.length - 1}
                                          onClick={(e) => { e.stopPropagation(); handleMoveStylingCategory(idx, 'down'); }}
                                          className="p-0.5 hover:text-[#38BDF8] disabled:opacity-20 cursor-pointer"
                                        >
                                          <ArrowDown className="w-2.5 h-2.5" />
                                        </button>
                                      </div>

                                      <div className="flex-1 min-w-0">
                                        {isCategoryEditing ? (
                                          <div className="flex gap-1 items-center" onClick={(e) => e.stopPropagation()}>
                                            <input
                                              type="text"
                                              required
                                              value={editingCategoryName}
                                              onChange={(e) => setEditingCategoryName(e.target.value)}
                                              className="px-1 py-0.5 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800 focus:outline-none w-full"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => handleRenameStylingCategory(category.id)}
                                              className="text-emerald-600 p-0.5 hover:bg-emerald-50 rounded shrink-0"
                                            >
                                              <Check className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setEditingCategoryId(null)}
                                              className="text-red-500 p-0.5 hover:bg-red-50 rounded shrink-0"
                                            >
                                              <X className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="flex flex-col">
                                            <span className="text-2xs font-extrabold text-slate-800 truncate">{category.name}</span>
                                            <span className="text-[9px] font-bold text-slate-400 mt-0.5">{category.options?.length || 0} design options</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {!isCategoryEditing && (
                                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 md:opacity-100">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingCategoryId(category.id);
                                            setEditingCategoryName(category.name);
                                          }}
                                          className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                                        >
                                          <Edit2 className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); handleDeleteStylingCategory(category); }}
                                          className="p-1 text-red-500 hover:text-red-700 rounded cursor-pointer"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Style Options creator inside selected category */}
                      <div className="md:col-span-7 space-y-4">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">2. Options in Category</span>
                        
                        {selectedStylingCategory ? (
                          <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-4">
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                              <span className="text-xs font-extrabold text-[#38BDF8] uppercase tracking-wide">
                                Category: {selectedStylingCategory.name}
                              </span>
                              <span className="text-3xs text-slate-400 font-extrabold uppercase">
                                {builderOptions.length} registered
                              </span>
                            </div>

                            {/* Add design option form */}
                            <form onSubmit={handleAddOption} className="flex gap-2">
                              <input
                                type="text"
                                required
                                value={newOptionName}
                                onChange={(e) => setNewOptionName(e.target.value)}
                                placeholder="e.g. Mandarin, Button-Down, Double Cuff"
                                className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none"
                              />
                              <button
                                type="submit"
                                className="px-3.5 py-1.5 bg-[#0F172A] hover:bg-slate-800 text-white font-extrabold rounded-lg text-2xs uppercase tracking-wider cursor-pointer"
                              >
                                Insert Option
                              </button>
                            </form>

                            {/* Option list and sorting */}
                            <div className="space-y-1.5 max-h-60 overflow-y-auto">
                              {builderOptions.length === 0 ? (
                                <p className="p-6 border border-dashed border-slate-150 rounded-lg text-center text-slate-400 text-3xs font-bold uppercase tracking-wider">
                                  No options built. Insert options using the field above.
                                </p>
                              ) : (
                                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                                  {builderOptions.map((opt, oIdx) => {
                                    const isOptionEditing = editingOptionIndex === oIdx;

                                    return (
                                      <div
                                        key={opt.id || oIdx}
                                        draggable={!isOptionEditing}
                                        onDragStart={() => handleDragStartOption(oIdx)}
                                        onDragOver={(e) => handleDragOverOption(e, oIdx)}
                                        onDrop={() => handleDropOption(oIdx)}
                                        className="group p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50/50 transition-colors select-none"
                                      >
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                          <GripVertical className="w-3.5 h-3.5 text-slate-300 cursor-grab shrink-0" />
                                          
                                          <div className="flex flex-col shrink-0 text-slate-400">
                                            <button
                                              type="button"
                                              disabled={oIdx === 0}
                                              onClick={() => handleMoveOption(oIdx, 'up')}
                                              className="p-0.2 hover:text-[#38BDF8] disabled:opacity-20 cursor-pointer"
                                            >
                                              <ArrowUp className="w-2.5 h-2.5" />
                                            </button>
                                            <button
                                              type="button"
                                              disabled={oIdx === builderOptions.length - 1}
                                              onClick={() => handleMoveOption(oIdx, 'down')}
                                              className="p-0.2 hover:text-[#38BDF8] disabled:opacity-20 cursor-pointer"
                                            >
                                              <ArrowDown className="w-2.5 h-2.5" />
                                            </button>
                                          </div>

                                          <div className="flex-1 min-w-0">
                                            {isOptionEditing ? (
                                              <div className="flex gap-1.5 items-center max-w-xs">
                                                <input
                                                  type="text"
                                                  required
                                                  value={editingOptionName}
                                                  onChange={(e) => setEditingOptionName(e.target.value)}
                                                  className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-2xs font-bold text-slate-800 focus:outline-none w-full"
                                                />
                                                <button
                                                  type="button"
                                                  onClick={() => handleSaveOptionName(oIdx)}
                                                  className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer shrink-0"
                                                >
                                                  <Check className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => setEditingOptionIndex(null)}
                                                  className="p-0.5 text-red-500 hover:bg-red-50 rounded cursor-pointer shrink-0"
                                                >
                                                  <X className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            ) : (
                                              <span className={`text-2xs font-extrabold ${opt.enabled ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                                                {opt.name}
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        {!isOptionEditing && (
                                          <div className="flex items-center gap-1 shrink-0 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                              type="button"
                                              onClick={() => handleToggleOptionEnable(oIdx)}
                                              className={`px-1.5 py-0.5 text-3xs font-bold rounded uppercase cursor-pointer ${
                                                opt.enabled 
                                                  ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' 
                                                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                              }`}
                                            >
                                              {opt.enabled ? 'Active' : 'Muted'}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEditingOptionIndex(oIdx);
                                                setEditingOptionName(opt.name);
                                              }}
                                              className="p-0.5 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                                            >
                                              <Edit2 className="w-3 h-3" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleRemoveOption(oIdx)}
                                              className="p-0.5 text-red-500 hover:text-red-700 rounded cursor-pointer"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Save options CTA */}
                            <div className="flex justify-between items-center border-t border-slate-100 pt-3 mt-1.5">
                              <div>
                                {saveOptionsSuccess && (
                                  <span className="text-emerald-600 text-3xs font-extrabold uppercase flex items-center gap-0.5 animate-fade-in">
                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    Saved successfully
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={handleSaveCategoryOptions}
                                className="px-3.5 py-1.5 bg-[#0F172A] hover:bg-slate-800 text-white font-extrabold rounded-lg text-btn-sm uppercase tracking-wider cursor-pointer"
                              >
                                Save Option Layout
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-3xs font-extrabold uppercase tracking-wider bg-white">
                            Select a style category on the left to add and configure options.
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                )}

              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3 min-h-[400px]">
              <HelpCircle className="w-12 h-12 text-slate-300" />
              <div className="space-y-1">
                <p className="text-sm font-bold uppercase tracking-wider text-slate-600">No active garment selected</p>
                <p className="text-xs text-slate-400 max-w-md">
                  Please select a garment type from the list, or create a brand new custom garment category to define its measurement specification form and style layout.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Custom Confirmation Modal */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-xl shrink-0 ${confirmModal.isDangerous ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">
                  {confirmModal.title}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap">
                  {confirmModal.message}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className={`px-4 py-2 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                  confirmModal.isDangerous 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : 'bg-[#0F172A] hover:bg-slate-800'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Alert Modal */}
      {alertModal && alertModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl shrink-0 bg-amber-50 text-amber-600">
                <Info className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">
                  {alertModal.title}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap">
                  {alertModal.message}
                </p>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setAlertModal(null)}
                className="px-4 py-2 bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
